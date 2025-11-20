import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  BarChart3,
  PieChart,
  Activity,
  Users,
  Calendar,
  Download,
  ChevronDown,
  ChevronUp,
  Eye,
  Target
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  AnalysisResult, 
  Insight, 
  Recommendation, 
  Visualization
} from '../types/analysis';

interface AnalysisResultVisualizationProps {
  result: AnalysisResult;
  onExport?: (format: 'pdf' | 'excel' | 'csv') => void;
  onDrillDown?: (insightId: string) => void;
}

export const AnalysisResultVisualization: React.FC<AnalysisResultVisualizationProps> = ({
  result,
  onExport,
  onDrillDown
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']));
  const [selectedVisualization, setSelectedVisualization] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const getAnalysisIcon = (type: string) => {
    switch (type) {
      case 'churn-patterns':
        return <Brain className="w-5 h-5" />;
      case 'engagement-correlation':
        return <Activity className="w-5 h-5" />;
      case 'cross-source':
        return <BarChart3 className="w-5 h-5" />;
      case 'organizational-insights':
        return <Users className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 dark:text-green-400';
    if (confidence >= 0.6) return 'text-blue-600 dark:text-blue-400';
    if (confidence >= 0.4) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getConfidenceBg = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 dark:bg-green-900/30';
    if (confidence >= 0.6) return 'bg-blue-100 dark:bg-blue-900/30';
    if (confidence >= 0.4) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  return (
    <div className="space-y-6">
      {/* Analysis Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              {getAnalysisIcon(result.type)}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {result.title}
              </h2>
              <div className="flex items-center space-x-4 mt-1">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {result.timestamp.toLocaleString()}
                </span>
                <div className={cn(
                  'px-2 py-1 rounded-full text-xs font-medium',
                  getConfidenceBg(result.confidence),
                  getConfidenceColor(result.confidence)
                )}>
                  {Math.round(result.confidence * 100)}% Confidence
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {result.executionTime}ms
                </span>
              </div>
            </div>
          </div>
          
          {onExport && (
            <div className="flex space-x-2">
              <button
                onClick={() => onExport('pdf')}
                className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center space-x-1"
              >
                <Download className="w-3 h-3" />
                <span>PDF</span>
              </button>
              <button
                onClick={() => onExport('excel')}
                className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center space-x-1"
              >
                <Download className="w-3 h-3" />
                <span>Excel</span>
              </button>
            </div>
          )}
        </div>

        {/* Data Sources */}
        {result.dataSources && result.dataSources.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {result.dataSources.map((source, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs rounded-md border border-blue-200 dark:border-blue-800"
              >
                {source.name}
              </span>
            ))}
          </div>
        )}

        {/* Summary */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            {result.summary}
          </p>
        </div>
      </div>

      {/* Key Insights */}
      <CollapsibleSection
        title="Key Insights"
        icon={<Eye className="w-4 h-4" />}
        isExpanded={expandedSections.has('insights')}
        onToggle={() => toggleSection('insights')}
        count={result.insights.length}
      >
        <div className="grid gap-4">
          {result.insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onDrillDown={onDrillDown}
            />
          ))}
        </div>
      </CollapsibleSection>

      {/* Visualizations */}
      {result.visualizations && result.visualizations.length > 0 && (
        <CollapsibleSection
          title="Visualizations"
          icon={<BarChart3 className="w-4 h-4" />}
          isExpanded={expandedSections.has('visualizations')}
          onToggle={() => toggleSection('visualizations')}
          count={result.visualizations.length}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.visualizations.map((viz) => (
              <VisualizationCard
                key={viz.id}
                visualization={viz}
                isSelected={selectedVisualization === viz.id}
                onSelect={() => setSelectedVisualization(viz.id)}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Recommendations */}
      {result.recommendations && result.recommendations.length > 0 && (
        <CollapsibleSection
          title="Recommendations"
          icon={<Target className="w-4 h-4" />}
          isExpanded={expandedSections.has('recommendations')}
          onToggle={() => toggleSection('recommendations')}
          count={result.recommendations.length}
        >
          <div className="space-y-4">
            {result.recommendations.map((recommendation) => (
              <RecommendationCard
                key={recommendation.id}
                recommendation={recommendation}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Analysis Parameters */}
      {result.parameters && (
        <CollapsibleSection
          title="Analysis Parameters"
          icon={<Info className="w-4 h-4" />}
          isExpanded={expandedSections.has('parameters')}
          onToggle={() => toggleSection('parameters')}
        >
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(result.parameters).map(([key, value]) => {
                const formatValue = (val: any): string => {
                  if (Array.isArray(val)) {
                    return val.map(item => {
                      if (typeof item === 'object' && item !== null) {
                        return Object.entries(item)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ');
                      }
                      return String(item);
                    }).join(' | ');
                  } else if (typeof val === 'object' && val !== null) {
                    return Object.entries(val)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ');
                  }
                  return String(val);
                };

                return (
                  <div key={key}>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100 mt-1 break-words">
                      {formatValue(value)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
};

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  count?: number;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  isExpanded,
  onToggle,
  count,
  children
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div className="text-gray-500 dark:text-gray-400">
            {icon}
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          {count !== undefined && (
            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-full">
              {count}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Insight Card Component
interface InsightCardProps {
  insight: Insight;
  onDrillDown?: (insightId: string) => void;
}

const InsightCard: React.FC<InsightCardProps> = ({ insight, onDrillDown }) => {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'medium':
        return <Info className="w-4 h-4 text-yellow-500" />;
      case 'low':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'medium':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'low':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      default:
        return 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 dark:text-green-400';
    if (confidence >= 0.6) return 'text-blue-600 dark:text-blue-400';
    if (confidence >= 0.4) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getConfidenceBg = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 dark:bg-green-900/30';
    if (confidence >= 0.6) return 'bg-blue-100 dark:bg-blue-900/30';
    if (confidence >= 0.4) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  return (
    <div className={cn(
      'p-4 rounded-lg border',
      getSeverityBg(insight.severity || 'low')
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          {getSeverityIcon(insight.severity || 'low')}
          <h4 className="font-medium text-gray-900 dark:text-gray-100">
            {insight.title}
          </h4>
        </div>
        <div className="flex items-center space-x-2">
          {insight.confidence && (
            <div className={cn(
              'px-2 py-1 rounded-full text-xs font-medium',
              getConfidenceBg(insight.confidence),
              getConfidenceColor(insight.confidence)
            )}>
              {Math.round(insight.confidence * 100)}%
            </div>
          )}
        </div>
      </div>
      
      <p className="text-gray-700 dark:text-gray-300 text-sm mb-3">
        {insight.description}
      </p>
      
      {(insight.affectedEmployees || insight.departments) && (
        <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400 mb-3">
          {insight.affectedEmployees && (
            <span className="flex items-center space-x-1">
              <Users className="w-3 h-3" />
              <span>{insight.affectedEmployees} employees</span>
            </span>
          )}
          {insight.departments && insight.departments.length > 0 && (
            <span>
              Departments: {insight.departments.join(', ')}
            </span>
          )}
        </div>
      )}
      
      {onDrillDown && (
        <button
          onClick={() => onDrillDown(insight.id)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
        >
          View Details →
        </button>
      )}
    </div>
  );
};

// Visualization Card Component
interface VisualizationCardProps {
  visualization: Visualization;
  isSelected: boolean;
  onSelect: () => void;
}

const VisualizationCard: React.FC<VisualizationCardProps> = ({
  visualization,
  isSelected,
  onSelect
}) => {
  const getVisualizationIcon = (type: string) => {
    switch (type) {
      case 'chart':
        return <BarChart3 className="w-5 h-5" />;
      case 'graph':
        return <Activity className="w-5 h-5" />;
      case 'heatmap':
        return <PieChart className="w-5 h-5" />;
      case 'pie-chart':
        return <PieChart className="w-5 h-5" />;
      case 'bar-chart':
        return <BarChart3 className="w-5 h-5" />;
      default:
        return <BarChart3 className="w-5 h-5" />;
    }
  };

  return (
    <div
      className={cn(
        'p-4 rounded-lg border-2 cursor-pointer transition-all',
        isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      )}
      onClick={onSelect}
    >
      <div className="flex items-center space-x-3 mb-3">
        <div className="text-gray-500 dark:text-gray-400">
          {getVisualizationIcon(visualization.type)}
        </div>
        <h4 className="font-medium text-gray-900 dark:text-gray-100">
          {visualization.title}
        </h4>
      </div>
      
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {visualization.type.charAt(0).toUpperCase() + visualization.type.slice(1)} visualization
      </p>
      
      {/* Render actual chart component if available */}
      <div className="h-80 bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
        {visualization.component ? (
          <div className="w-full h-full p-2">
            <visualization.component />
          </div>
        ) : (
          <div className="h-full bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
            <span className="text-gray-500 dark:text-gray-400 text-sm">
              {visualization.type.charAt(0).toUpperCase() + visualization.type.slice(1)} Visualization
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// Recommendation Card Component
interface RecommendationCardProps {
  recommendation: Recommendation;
}

const RecommendationCard: React.FC<RecommendationCardProps> = ({ recommendation }) => {
  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'medium':
        return <TrendingUp className="w-4 h-4 text-yellow-500" />;
      case 'low':
        return <TrendingDown className="w-4 h-4 text-green-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  const getPriorityBg = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'medium':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'low':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      default:
        return 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600';
    }
  };

  return (
    <div className={cn(
      'p-4 rounded-lg border',
      getPriorityBg(recommendation.priority || 'low')
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          {getPriorityIcon(recommendation.priority || 'low')}
          <h4 className="font-medium text-gray-900 dark:text-gray-100">
            {recommendation.title}
          </h4>
        </div>
        <div className="flex items-center space-x-2">
          {recommendation.priority && (
            <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
              {recommendation.priority} Priority
            </span>
          )}
        </div>
      </div>
      
      <p className="text-gray-700 dark:text-gray-300 text-sm mb-3">
        {recommendation.description}
      </p>
      
      {recommendation.actionItems && recommendation.actionItems.length > 0 && (
        <div className="mb-3">
          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
            Action Items:
          </h5>
          <ul className="space-y-1">
            {recommendation.actionItems.map((item, index) => (
              <li key={index} className="text-sm text-gray-600 dark:text-gray-400 flex items-start">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center space-x-1">
          <Calendar className="w-3 h-3" />
          <span>{recommendation.estimatedTimeframe}</span>
        </span>
        <span>Impact: {recommendation.estimatedImpact}</span>
      </div>
    </div>
  );
};

export default AnalysisResultVisualization;