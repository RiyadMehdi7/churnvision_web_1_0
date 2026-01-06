import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, TrendingUp, FileText, ChevronDown, ChevronUp, MapPin, Calendar, Brain, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RiskIndicator } from '@/components/risk/RiskIndicator';

export interface SimilarityEntry {
  name: string;
  department: string;
  similarityScore: number; // Expecting a value between 0 and 1
}

export interface EnhancedSimilarityEntry {
  name: string;
  department: string;
  position: string;
  tenure: number;
  similarityScore: number;
  churnRisk: number;
  stage: string;
  mlScore: number;
  heuristicScore: number;
  confidenceLevel: number;
}

interface SimilarityTableProps {
  targetEmployeeName: string;
  similarEmployees: SimilarityEntry[] | EnhancedSimilarityEntry[];
  explanation: string;
  comparisonType?: string;
}

// Type guard to check if we have enhanced similarity entries
const isEnhancedEntry = (entry: SimilarityEntry | EnhancedSimilarityEntry): entry is EnhancedSimilarityEntry => {
  return 'churnRisk' in entry && 'stage' in entry;
};

// Define markdownComponents specifically for the explanation
const explanationMarkdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
};

const SimilarityTable: React.FC<SimilarityTableProps> = ({
  targetEmployeeName,
  similarEmployees,
  explanation,
  comparisonType = 'resigned'
}) => {
  const [isExplanationVisible, setIsExplanationVisible] = useState(true);

  if (!similarEmployees || similarEmployees.length === 0) {
    return (
      <div className="my-4 p-4 rounded-lg bg-gray-100 dark:bg-gray-700/50 text-center text-gray-600 dark:text-gray-400">
        No similar {comparisonType} employees found for {targetEmployeeName}.
      </div>
    );
  }

  // Sort by similarity score descending
  const sortedEmployees = [...similarEmployees].sort((a, b) => b.similarityScore - a.similarityScore);
  
  // Check if we have enhanced data
  const hasEnhancedData = sortedEmployees.length > 0 && isEnhancedEntry(sortedEmployees[0]);

  const getScoreColor = (score: number): string => {
    if (score > 0.75) return 'text-red-500 dark:text-red-400';
    if (score > 0.5) return 'text-yellow-500 dark:text-yellow-400';
    return 'text-emerald-500 dark:text-emerald-400';
  };

  const getScoreBgColor = (score: number): string => {
    if (score > 0.75) return 'bg-red-100 dark:bg-red-900/30';
    if (score > 0.5) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-emerald-100 dark:bg-emerald-900/30';
  };

  const getComparisonTitle = () => {
    switch (comparisonType) {
      case 'resigned':
        return 'vs. Past Departures';
      case 'active':
        return 'vs. Current Colleagues';
      default:
        return 'vs. Similar Employees';
    }
  };

  const getComparisonIcon = () => {
    switch (comparisonType) {
      case 'resigned':
        return <TrendingUp size={20} className="text-red-500 dark:text-red-400" />;
      case 'active':
        return <Users size={20} className="text-emerald-500 dark:text-emerald-400" />;
      default:
        return <Users size={20} className="text-blue-500 dark:text-blue-400" />;
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div 
      className="similarity-analysis-container my-4 p-5 rounded-xl bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-800 dark:via-gray-850 dark:to-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.h3 
        className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2"
        variants={itemVariants}
      >
        {getComparisonIcon()}
        Similarity Analysis: <span className="font-medium text-emerald-600 dark:text-emerald-400">{targetEmployeeName}</span> {getComparisonTitle()}
      </motion.h3>
      
      {/* Explanation Section */}
      <motion.div 
        className="explanation-section mb-6 rounded-lg bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 overflow-hidden"
        variants={itemVariants}
        layout
      >
        <div className="flex justify-between items-center p-4 cursor-pointer" onClick={() => setIsExplanationVisible(!isExplanationVisible)}>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
            <FileText size={16} className="text-blue-500 dark:text-blue-400"/>
            AI Explanation
          </h4>
          <button 
            className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors rounded-full"
            aria-label={isExplanationVisible ? 'Hide explanation' : 'Show explanation'}
          >
            {isExplanationVisible ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
        {isExplanationVisible && (
          <motion.div
            className="px-4 pb-4 pt-0 prose prose-sm max-w-none dark:prose-invert prose-ul:list-disc prose-ul:pl-5 prose-li:mb-1 text-gray-600 dark:text-gray-300 leading-relaxed"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={explanationMarkdownComponents}>
              {explanation}
            </ReactMarkdown>
          </motion.div>
        )}
      </motion.div>

      {/* Enhanced Table Section */}
      <motion.div className="overflow-x-auto" variants={itemVariants}>
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-100 dark:bg-gray-700/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Employee Details
              </th>
              {hasEnhancedData && (
                <>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Risk Profile
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    AI Analysis
                  </th>
                </>
              )}
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp size={14}/> Similarity
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedEmployees.map((emp, index) => {
              const enhanced = isEnhancedEntry(emp) ? emp : null;
              
              return (
                <motion.tr 
                  key={`${emp.name}-${index}`}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors duration-150"
                  variants={itemVariants}
                >
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{emp.name}</div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <div className="flex items-center gap-1">
                          <MapPin size={12} />
                          {emp.department}
                        </div>
                        {enhanced && (
                          <>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                              <Calendar size={12} />
                              {enhanced.tenure}y
                            </div>
                          </>
                        )}
                      </div>
                      {enhanced && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {enhanced.position}
                        </div>
                      )}
                    </div>
                  </td>
                  
                  {hasEnhancedData && enhanced && (
                    <>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-2">
                          <RiskIndicator riskScore={enhanced.churnRisk} size="sm" showIcon={false} />
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Stage: {enhanced.stage}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-xs">
                            <Brain size={12} className="text-blue-500" />
                            <span className="text-gray-600 dark:text-gray-400">
                              ML: {(enhanced.mlScore * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <AlertTriangle size={12} className="text-orange-500" />
                            <span className="text-gray-600 dark:text-gray-400">
                              Rules: {(enhanced.heuristicScore * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Confidence: {(enhanced.confidenceLevel * 100).toFixed(0)}%
                          </div>
                        </div>
                      </td>
                    </>
                  )}
                  
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span 
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getScoreBgColor(emp.similarityScore)} ${getScoreColor(emp.similarityScore)}`}
                    >
                      {(emp.similarityScore * 100).toFixed(1)}% 
                    </span>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </motion.div>
    </motion.div>
  );
};

export default SimilarityTable; 