import { createFileRoute } from '@tanstack/react-router'
import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import chatbotService from '../services/chatbot';
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
    Expand,
    X,
} from 'lucide-react';
import { RiskIndicator } from '../components/RiskIndicator';
import { motion, AnimatePresence } from 'framer-motion';
import { useGlobalDataCache } from '../hooks/useGlobalDataCache';
import { useBatchReasoning } from '../hooks/useReasoning';
// import ReactWindow from 'react-window';
// const { FixedSizeList: List } = ReactWindow;

// Mock List component to bypass react-window build issues
const List = ({ height, itemCount, itemSize, width, children }: any) => (
    <div style={{ height, width, overflow: 'auto' }}>
        <div style={{ height: itemCount * itemSize, position: 'relative' }}>
            {Array.from({ length: itemCount }).map((_, index) => (
                <div key={index} style={{ position: 'absolute', top: index * itemSize, width: '100%', height: itemSize }}>
                    {children({ index, style: { width: '100%', height: itemSize } })}
                </div>
            ))}
        </div>
    </div>
);
import { AutoSizer } from 'react-virtualized';
import { v4 as uuidv4 } from 'uuid';
import { useLocation } from '@tanstack/react-router';
import { ChatMessage as GlobalChatMessage } from '@/types/chat';
import { Employee } from '@/types/employee';
import { useProject } from '@/contexts/ProjectContext';
import SimilarityTable from '../components/SimilarityTable';
import { ChurnReasoning } from '@/types/reasoning';
import { getCurrentThresholds, getDynamicRiskLevel } from '@/config/riskThresholds';
import { standardizePrompt } from '../utils/promptStandardizer';
import { TrainingReminderBanner } from '../components/TrainingReminderBanner';
import { ModelTrainingRequired } from '../components/ModelTrainingRequired';
import { ChatMessage } from '../components/ChatMessage';
import { AnalysisInProgressIndicator } from '../components/AnalysisInProgressIndicator';

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

export const Route = createFileRoute('/ai-assistant')({
    component: AIAssistant,
})

type ResponseKind = 'analysis' | 'chat';

interface ExtendedChatMessage extends GlobalChatMessage {
    structuredData?: PossibleStructuredData;
    isOptimistic?: boolean;
    responseKind?: ResponseKind;
    responseTimeMs?: number;
}

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

const LoadingSpinner = () => (
    <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-emerald-500 dark:border-gray-700 dark:border-t-emerald-400" />
);

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
    const riskScore = reasoningData?.churn_risk ?? employee.churnProbability ?? 0;

    return (
        <motion.button
            onClick={onClick}
            className={`
        w-full p-3 rounded-lg text-left
        transition-all duration-300
        ${isSelected
                    ? 'bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 shadow-sm'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-transparent'
                }
        border relative group overflow-hidden
        dark:text-gray-100
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
                width: '100vw',
                height: '100vh',
                top: 0,
                left: 0,
                position: 'fixed',
            }}
        >
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

            <div
                className="overflow-auto bg-gray-50 dark:bg-gray-900"
                style={{ height: 'calc(100vh - 50px)' }}
            >
                <div className="max-w-5xl mx-auto p-6">
                    {children}
                </div>
            </div>
        </div>
    );
});

function AIAssistant() {
    const { data: employees = [], isLoading: isDataLoading } = useGlobalDataCache();
    const { project } = useProject();
    const { isReasoning, reasoningData, generateReasoning } = useBatchReasoning();

    const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showEmployeeList, setShowEmployeeList] = useState(true);
    const [fullScreenAnalysis, setFullScreenAnalysis] = useState<PossibleStructuredData | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<List>(null);
    const location = useLocation();

    // Filter employees
    const filteredEmployees = useMemo(() => {
        if (!searchQuery) return employees;
        const lower = searchQuery.toLowerCase();
        return employees.filter(emp =>
            emp.name.toLowerCase().includes(lower) ||
            emp.position.toLowerCase().includes(lower) ||
            emp.department.toLowerCase().includes(lower)
        );
    }, [employees, searchQuery]);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping, scrollToBottom]);

    // Handle initial reasoning generation
    useEffect(() => {
        if (employees.length > 0 && Object.keys(reasoningData).length === 0 && !isReasoning) {
            generateReasoning(employees);
        }
    }, [employees, reasoningData, isReasoning, generateReasoning]);

    // Handle location state (e.g. navigation from dashboard)
    useEffect(() => {
        if (location.state && (location.state as any).selectedEmployeeId) {
            setSelectedEmployeeId((location.state as any).selectedEmployeeId);
            // Optionally send an initial message about this employee
        }
    }, [location.state]);

    const handleSendMessage = async () => {
        if (!inputValue.trim()) return;

        const userMessage: ExtendedChatMessage = {
            id: uuidv4(),
            role: 'user',
            message: inputValue,
            content: inputValue, // Add content property for compatibility
            timestamp: new Date(),
            responseKind: 'chat'
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsTyping(true);

        try {
            const selectedEmployee = selectedEmployeeId
                ? employees.find(e => e.id === selectedEmployeeId)
                : undefined;

            const context = {
                selectedEmployee,
                projectContext: project,
                recentMessages: messages.slice(-5)
            };

            const response = await chatbotService.sendMessage(userMessage.message, context);

            const botMessage: ExtendedChatMessage = {
                ...response,
                content: response.message, // Ensure content is set
                responseKind: inferResponseKind(response.message, !!selectedEmployee)
            };

            setMessages(prev => [...prev, botMessage]);
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage: ExtendedChatMessage = {
                id: uuidv4(),
                role: 'assistant',
                message: "I apologize, but I encountered an error processing your request. Please try again.",
                content: "I apologize, but I encountered an error processing your request. Please try again.",
                timestamp: new Date(),
                responseKind: 'chat'
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleEmployeeSelect = (employeeId: string) => {
        setSelectedEmployeeId(employeeId);
        // Could trigger a context switch message here
    };

    const renderAnalysisContent = (data: PossibleStructuredData) => {
        switch (data.type) {
            case 'enhancedChurnRiskDiagnosis':
                return <EnhancedChurnRiskDiagnosisRenderer data={data as EnhancedChurnRiskDiagnosisData} />;
            case 'enhancedRetentionPlaybook':
                return <EnhancedRetentionPlaybookRenderer data={data as EnhancedRetentionPlaybookData} />;
            case 'enhancedSimilarityAnalysis':
                return <EnhancedSimilarityAnalysisRenderer data={data as EnhancedSimilarityAnalysisData} />;
            case 'churn_trends_analysis':
                return <WorkforceTrendsAnalysisRenderer data={data as WorkforceTrendsAnalysisData} />;
            case 'department_analysis':
                return <DepartmentAnalysisRenderer data={data as DepartmentAnalysisData} />;
            case 'exit_pattern_mining':
                return <EnhancedExitPatternMiningRenderer data={data as EnhancedExitPatternMiningData} />;
            case 'peer_retention_comparison':
                return <PeerRetentionComparisonRenderer data={data as any} />;
            case 'legacy_retention_playbook':
                return <LegacyRetentionPlaybookRenderer data={data as any} />;
            case 'legacy_exit_pattern':
                return <LegacyExitPatternRenderer data={data as any} />;
            default:
                return <div className="p-4 text-gray-500">Analysis type not supported: {data.type}</div>;
        }
    };

    if (isDataLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
                <LoadingSpinner />
            </div>
        );
    }

    // Check if model training is required
    const isModelReady = true; // Replace with actual check if available
    if (!isModelReady) {
        return (
            <div className="p-8 max-w-4xl mx-auto">
                <ModelTrainingRequired />
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900 overflow-hidden">
            {/* Sidebar - Employee List */}
            <AnimatePresence initial={false}>
                {showEmployeeList && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 320, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        className="border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col h-full z-20 shadow-xl"
                    >
                        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-sm">
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                                <Users className="w-5 h-5 text-emerald-600" />
                                Workforce Context
                            </h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Search employees..."
                                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden">
                            <AutoSizer>
                                {({ height, width }) => (
                                    <List
                                        ref={listRef}
                                        height={height}
                                        itemCount={filteredEmployees.length}
                                        itemSize={80}
                                        width={width}
                                        className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
                                    >
                                        {({ index, style }) => (
                                            <div style={style} className="px-3 py-1">
                                                <EmployeeRow
                                                    employee={filteredEmployees[index]}
                                                    isSelected={selectedEmployeeId === filteredEmployees[index].id}
                                                    onClick={() => handleEmployeeSelect(filteredEmployees[index].id)}
                                                    reasoningData={reasoningData[filteredEmployees[index].id]}
                                                />
                                            </div>
                                        )}
                                    </List>
                                )}
                            </AutoSizer>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full relative bg-white dark:bg-gray-900">
                {/* Toggle Sidebar Button */}
                <button
                    onClick={() => setShowEmployeeList(!showEmployeeList)}
                    className="absolute left-4 top-4 z-10 p-2 bg-white dark:bg-gray-800 rounded-full shadow-md border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-emerald-600 transition-colors"
                >
                    {showEmployeeList ? <ChevronDown className="rotate-90 w-4 h-4" /> : <ChevronUp className="rotate-90 w-4 h-4" />}
                </button>

                {/* Header */}
                <div className="h-16 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md z-10">
                    <div className="flex items-center gap-3 ml-10">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                            <Bot size={18} />
                        </div>
                        <div>
                            <h1 className="font-semibold text-gray-900 dark:text-gray-100">AI Retention Assistant</h1>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">Online & Ready</span>
                            </div>
                        </div>
                    </div>

                    {selectedEmployeeId && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-full text-sm border border-emerald-100 dark:border-emerald-800">
                            <User size={14} />
                            <span className="font-medium">
                                Context: {employees.find(e => e.id === selectedEmployeeId)?.name}
                            </span>
                            <button
                                onClick={() => setSelectedEmployeeId(null)}
                                className="ml-1 hover:text-emerald-900 dark:hover:text-emerald-100"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 bg-gray-50/50 dark:bg-gray-900/50">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-0 animate-fade-in" style={{ animationFillMode: 'forwards' }}>
                            <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-blue-100 dark:from-emerald-900/30 dark:to-blue-900/30 rounded-3xl flex items-center justify-center mb-4 shadow-xl shadow-emerald-500/10">
                                <Bot className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                How can I help you today?
                            </h2>
                            <p className="text-gray-500 dark:text-gray-400 max-w-md">
                                I can analyze retention risks, suggest intervention strategies, or compare employee metrics against team benchmarks.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full mt-8">
                                {[
                                    "Analyze retention risk for Engineering",
                                    "Compare John Doe with top performers",
                                    "Draft a retention plan for high-risk employees",
                                    "What are the main exit drivers this month?"
                                ].map((prompt, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            setInputValue(prompt);
                                            // Optionally auto-send: handleSendMessage();
                                        }}
                                        className="p-4 text-left bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border border-gray-200 dark:border-gray-700 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md group"
                                    >
                                        <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 font-medium">
                                            {prompt}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {messages.map((msg, index) => (
                                <div key={msg.id}>
                                    <ChatMessage message={msg} />
                                    {msg.structuredData && (
                                        <div className="ml-12 mt-2 mb-6 max-w-4xl">
                                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700">
                                                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Analysis Result</span>
                                                    <button
                                                        onClick={() => setFullScreenAnalysis(msg.structuredData || null)}
                                                        className="text-gray-400 hover:text-emerald-600 transition-colors"
                                                        title="View Full Screen"
                                                    >
                                                        <Expand size={16} />
                                                    </button>
                                                </div>
                                                <div className="p-4">
                                                    {renderAnalysisContent(msg.structuredData)}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isTyping && <AnalysisInProgressIndicator />}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 absolute bottom-0 left-0 right-0 z-20">
                    <div className="max-w-4xl mx-auto relative">
                        <div className="relative flex items-end gap-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-2 shadow-lg shadow-gray-200/50 dark:shadow-none focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                                placeholder={selectedEmployeeId
                                    ? `Ask about ${employees.find(e => e.id === selectedEmployeeId)?.name}...`
                                    : "Ask anything about your workforce..."
                                }
                                className="w-full max-h-32 min-h-[44px] py-2.5 px-4 bg-transparent border-none focus:ring-0 resize-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm scrollbar-hide"
                                rows={1}
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim() || isTyping}
                                className={`
                  p-2.5 rounded-xl flex-shrink-0 transition-all duration-200
                  ${inputValue.trim() && !isTyping
                                        ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 transform hover:scale-105 hover:shadow-emerald-500/40'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                                    }
                `}
                            >
                                <Send size={18} />
                            </button>
                        </div>
                        <div className="text-center mt-2">
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                AI can make mistakes. Please verify critical information.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Full Screen Modal */}
            <FullScreenModal
                isOpen={!!fullScreenAnalysis}
                onClose={() => setFullScreenAnalysis(null)}
            >
                {fullScreenAnalysis && renderAnalysisContent(fullScreenAnalysis)}
            </FullScreenModal>
        </div>
    );
}
