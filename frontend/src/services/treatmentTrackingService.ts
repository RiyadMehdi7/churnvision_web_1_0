import api from '@/services/api';

export interface TreatmentApplication {
  id: number;
  employee_id: string;
  hr_code: string;
  treatment_name: string;
  treatment_type: string;
  predicted_churn_reduction: number;
  predicted_cost: number;
  predicted_roi: number;
  actual_cost?: number;
  applied_date: string;
  status: 'applied' | 'active' | 'completed' | 'cancelled';
  ab_group: 'control' | 'treatment';
}

export interface TreatmentEffectiveness {
  treatment_type: string;
  treatment_name: string;
  total_applications: number;
  successful_retentions: number;
  effectiveness_rate: number;
  average_cost: number;
  roi_ratio: number;
  statistical_significance: boolean;
  sample_size: number;
}

export interface ABTestResult {
  test_name: string;
  group_assignment: 'control' | 'treatment';
  group_size: number;
  avg_baseline_risk: number;
  retained_count: number;
  churned_count: number;
  retention_rate: number;
}

export const treatmentTrackingService = {
  async getEmployeeApplications(projectId: string, employeeId: string): Promise<TreatmentApplication[]> {
    const res = await api.get(`/api/eltv/tracking/applications/${encodeURIComponent(employeeId)}`, { params: { projectId } });
    return res.data?.data || [];
  },

  async getEffectiveness(projectId: string): Promise<TreatmentEffectiveness[]> {
    const res = await api.get('/api/eltv/tracking/effectiveness', { params: { projectId } });
    return res.data?.data || [];
  },

  async getABTests(projectId: string, testName?: string): Promise<ABTestResult[]> {
    const res = await api.get('/api/eltv/tracking/ab-tests', { params: { projectId, testName } });
    return res.data?.data || [];
  },

  async createABTest(projectId: string, payload?: { testName?: string; controlRatio?: number; employees?: any[] }) {
    const res = await api.post('/api/eltv/tracking/ab-tests', { projectId, ...(payload || {}) });
    return res.data?.data;
  },

  async syncHR(projectId: string, connectionDetails: any) {
    const res = await api.post('/api/eltv/tracking/hr-sync', { projectId, connectionDetails });
    return res.data?.data;
  },

  async getLastSync(projectId: string): Promise<string | null> {
    const res = await api.get('/api/eltv/tracking/last-sync', { params: { projectId } });
    return res.data?.data ?? null;
  }
};

export default treatmentTrackingService;


