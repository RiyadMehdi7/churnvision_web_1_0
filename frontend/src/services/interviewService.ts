import api from '@/services/api';
import { InterviewData } from '../types/employee';

export interface InterviewUploadResponse {
  success: boolean;
  message: string;
  data?: InterviewData[];
  error?: string;
}

export interface InterviewProcessResponse {
  success: boolean;
  data?: {
    overall_sentiment: 'positive' | 'negative' | 'neutral';
    sentiment_score: number;
    insights: Array<{
      theme: string;
      sentiment: 'positive' | 'negative' | 'neutral';
      impact_score: number;
      key_phrases: string[];
      suggestions?: string[];
    }>;
    risk_adjustment: number;
    key_themes: string[];
    recommendations: string[];
  };
  error?: string;
}

export const interviewService = {
  /**
   * Upload interview data file
   */
  async uploadInterviewData(file: File, data: any[]): Promise<InterviewUploadResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('data', JSON.stringify(data));
      formData.append('type', 'interview');

      const response = await api.post('/api/data/interviews/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: 'Upload failed',
        error: error.response?.data?.error || error.message || 'Unknown error'
      };
    }
  },

  /**
   * Get interview data for specific employee
   */
  async getInterviewData(hrCode: string): Promise<{ success: boolean; data?: InterviewData[]; error?: string }> {
    try {
      const response = await api.get(`/api/data/interviews/${hrCode}`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to fetch interview data'
      };
    }
  },

  /**
   * Process interview notes with LLM
   */
  async processInterviewNotes(notes: string, interviewType: 'stay' | 'exit'): Promise<InterviewProcessResponse> {
    try {
      const response = await api.post('/api/data/interviews/process', {
        notes,
        interviewType
      });

      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to process interview notes'
      };
    }
  },

  /**
   * Get interview insights summary for analytics
   */
  async getInterviewInsightsSummary(): Promise<{
    success: boolean;
    data?: {
      total_interviews: number;
      stay_interviews: number;
      exit_interviews: number;
      sentiment_distribution: {
        positive: number;
        negative: number;
        neutral: number;
      };
      top_themes: Array<{
        theme: string;
        count: number;
        avg_impact: number;
      }>;
      risk_adjustments: {
        positive_adjustments: number;
        negative_adjustments: number;
        avg_adjustment: number;
      };
    };
    error?: string;
  }> {
    try {
      const response = await api.get('/api/data/interviews/insights-summary');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to fetch insights summary'
      };
    }
  }
};

export default interviewService;