import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, TrendingUp, TrendingDown, Users, Brain, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { interviewService } from '@/services/interviewService';

interface InterviewInsightsPanelProps {
  className?: string;
}

export function InterviewInsightsPanel({ className }: InterviewInsightsPanelProps) {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const result = await interviewService.getInterviewInsightsSummary();
      
      if (result.success) {
        setInsights(result.data);
      } else {
        setError(result.error || 'Failed to fetch insights');
      }
    } catch (error) {
      setError('Failed to fetch insights');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={cn("bg-white rounded-lg border border-gray-200 p-6", className)}>
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error || !insights) {
    return (
      <div className={cn("bg-white rounded-lg border border-gray-200 p-6", className)}>
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">{error || 'No interview data available'}</p>
          </div>
        </div>
      </div>
    );
  }

  const totalInterviews = insights.total_interviews || 0;
  const sentimentTotal = insights.sentiment_distribution.positive + 
                        insights.sentiment_distribution.negative + 
                        insights.sentiment_distribution.neutral;
  
  const positivePercentage = sentimentTotal > 0 ? 
    (insights.sentiment_distribution.positive / sentimentTotal * 100).toFixed(1) : '0';
  const negativePercentage = sentimentTotal > 0 ? 
    (insights.sentiment_distribution.negative / sentimentTotal * 100).toFixed(1) : '0';

  return (
    <div className={cn("bg-white rounded-lg border border-gray-200 p-6", className)}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <MessageSquare className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">Interview Insights</h2>
        </div>
        <button
          onClick={fetchInsights}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-blue-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-blue-900">Total Interviews</p>
              <p className="text-2xl font-bold text-blue-600">{totalInterviews}</p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-green-900">Stay Interviews</p>
              <p className="text-2xl font-bold text-green-600">{insights.stay_interviews}</p>
            </div>
          </div>
        </div>

        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-8 w-8 text-red-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-red-900">Exit Interviews</p>
              <p className="text-2xl font-bold text-red-600">{insights.exit_interviews}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sentiment Analysis */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Sentiment Distribution</h3>
        <div className="space-y-3">
          <div className="flex items-center">
            <div className="w-24 text-sm text-gray-600">Positive</div>
            <div className="flex-1 mx-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${positivePercentage}%` }}
                />
              </div>
            </div>
            <div className="w-16 text-sm text-gray-900 font-medium">
              {positivePercentage}%
            </div>
          </div>

          <div className="flex items-center">
            <div className="w-24 text-sm text-gray-600">Negative</div>
            <div className="flex-1 mx-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-red-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${negativePercentage}%` }}
                />
              </div>
            </div>
            <div className="w-16 text-sm text-gray-900 font-medium">
              {negativePercentage}%
            </div>
          </div>

          <div className="flex items-center">
            <div className="w-24 text-sm text-gray-600">Neutral</div>
            <div className="flex-1 mx-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gray-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${100 - parseFloat(positivePercentage) - parseFloat(negativePercentage)}%` }}
                />
              </div>
            </div>
            <div className="w-16 text-sm text-gray-900 font-medium">
              {(100 - parseFloat(positivePercentage) - parseFloat(negativePercentage)).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Top Themes */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Top Themes</h3>
        <div className="space-y-2">
          {insights.top_themes.length > 0 ? (
            insights.top_themes.slice(0, 5).map((theme: any, index: number) => (
              <motion.div
                key={theme.theme}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full" />
                  <span className="text-sm font-medium text-gray-900">{theme.theme}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">{theme.count} mentions</div>
                  <div className="text-xs text-gray-500">
                    Impact: {(theme.avg_impact * 100).toFixed(0)}%
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <p className="text-sm text-gray-500">No themes identified yet</p>
          )}
        </div>
      </div>

      {/* Risk Adjustments */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-3">Risk Score Impact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
            <TrendingDown className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-900">Risk Reductions</p>
              <p className="text-lg font-bold text-green-600">{insights.risk_adjustments.positive_adjustments}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 bg-red-50 rounded-lg">
            <TrendingUp className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-900">Risk Increases</p>
              <p className="text-lg font-bold text-red-600">{insights.risk_adjustments.negative_adjustments}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <Brain className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">
              Average Risk Adjustment: {(insights.risk_adjustments.avg_adjustment * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InterviewInsightsPanel;