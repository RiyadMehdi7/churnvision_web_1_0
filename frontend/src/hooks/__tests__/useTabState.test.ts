/**
 * Tests for useTabState hook - Tab state management with persistence
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabState } from '../useTabState';

describe('useTabState', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default tab when no stored value', () => {
      const { result } = renderHook(() => useTabState('dashboard'));

      expect(result.current.activeTab).toBe('dashboard');
    });

    it('should restore active tab from localStorage', () => {
      localStorage.setItem('churnvision-active-tab', 'deepAnalysis');

      const { result } = renderHook(() => useTabState('dashboard'));

      expect(result.current.activeTab).toBe('deepAnalysis');
    });

    it('should initialize default tab states', () => {
      const { result } = renderHook(() => useTabState());

      expect(result.current.tabStates.dashboard).toBeDefined();
      expect(result.current.tabStates.deepAnalysis).toBeDefined();
      expect(result.current.tabStates.dashboard.filters).toBeDefined();
      expect(result.current.tabStates.dashboard.sortConfig).toBeDefined();
    });

    it('should restore tab states from localStorage', () => {
      const storedStates = {
        dashboard: {
          filters: {
            searchTerm: 'test',
            selectedDepartment: 'IT',
            selectedPosition: '',
            selectedRiskLevel: 'HIGH',
            selectedStatus: 'Active',
          },
          sortConfig: {
            field: 'name',
            direction: 'asc',
          },
          selectedEmployees: ['emp-1'],
        },
        deepAnalysis: {
          selectedAnalysisType: 'churn',
          analysisParams: {},
          activeDataSources: [],
          currentResults: null,
          savedAnalyses: [],
        },
      };

      localStorage.setItem('churnvision-tab-states', JSON.stringify(storedStates));

      const { result } = renderHook(() => useTabState());

      expect(result.current.tabStates.dashboard.filters.searchTerm).toBe('test');
      expect(result.current.tabStates.dashboard.filters.selectedRiskLevel).toBe('HIGH');
    });

    it('should handle invalid JSON in localStorage gracefully', () => {
      localStorage.setItem('churnvision-tab-states', 'invalid-json');

      const { result } = renderHook(() => useTabState());

      expect(result.current.tabStates.dashboard).toBeDefined();
      expect(result.current.tabStates.dashboard.filters.searchTerm).toBe('');
    });
  });

  describe('setActiveTab', () => {
    it('should update active tab', () => {
      const { result } = renderHook(() => useTabState('dashboard'));

      act(() => {
        result.current.setActiveTab('deepAnalysis');
      });

      expect(result.current.activeTab).toBe('deepAnalysis');
    });

    it('should persist active tab to localStorage', () => {
      const { result } = renderHook(() => useTabState('dashboard'));

      act(() => {
        result.current.setActiveTab('deepAnalysis');
      });

      expect(localStorage.getItem('churnvision-active-tab')).toBe('deepAnalysis');
    });
  });

  describe('updateTabState', () => {
    it('should update dashboard filters', () => {
      const { result } = renderHook(() => useTabState());

      act(() => {
        result.current.updateTabState('dashboard', {
          filters: {
            ...result.current.tabStates.dashboard.filters,
            searchTerm: 'John',
            selectedDepartment: 'Engineering',
          },
        });
      });

      expect(result.current.tabStates.dashboard.filters.searchTerm).toBe('John');
      expect(result.current.tabStates.dashboard.filters.selectedDepartment).toBe('Engineering');
    });

    it('should update sort config', () => {
      const { result } = renderHook(() => useTabState());

      act(() => {
        result.current.updateTabState('dashboard', {
          sortConfig: { field: 'name', direction: 'asc' },
        });
      });

      expect(result.current.tabStates.dashboard.sortConfig.field).toBe('name');
      expect(result.current.tabStates.dashboard.sortConfig.direction).toBe('asc');
    });

    it('should update deep analysis state', () => {
      const { result } = renderHook(() => useTabState());

      act(() => {
        result.current.updateTabState('deepAnalysis', {
          selectedAnalysisType: 'similarity',
        });
      });

      expect(result.current.tabStates.deepAnalysis.selectedAnalysisType).toBe('similarity');
    });

    it('should persist tab states to localStorage', () => {
      const { result } = renderHook(() => useTabState());

      act(() => {
        result.current.updateTabState('dashboard', {
          filters: {
            ...result.current.tabStates.dashboard.filters,
            searchTerm: 'persisted',
          },
        });
      });

      const stored = JSON.parse(localStorage.getItem('churnvision-tab-states') || '{}');
      expect(stored.dashboard.filters.searchTerm).toBe('persisted');
    });
  });

  describe('updateSharedContext', () => {
    it('should update shared context', () => {
      const { result } = renderHook(() => useTabState());

      act(() => {
        result.current.updateSharedContext({
          selectedEmployeeId: 'emp-123',
          selectedDepartment: 'Sales',
        });
      });

      expect(result.current.sharedContext.selectedEmployeeId).toBe('emp-123');
      expect(result.current.sharedContext.selectedDepartment).toBe('Sales');
    });

    it('should persist shared context to localStorage', () => {
      const { result } = renderHook(() => useTabState());

      act(() => {
        result.current.updateSharedContext({
          selectedEmployeeId: 'emp-456',
        });
      });

      const stored = JSON.parse(localStorage.getItem('churnvision-shared-context') || '{}');
      expect(stored.selectedEmployeeId).toBe('emp-456');
    });
  });

  describe('resetTabStates', () => {
    it('should reset all tab states to defaults', () => {
      const { result } = renderHook(() => useTabState());

      // Modify state first
      act(() => {
        result.current.updateTabState('dashboard', {
          filters: {
            ...result.current.tabStates.dashboard.filters,
            searchTerm: 'modified',
          },
        });
      });

      expect(result.current.tabStates.dashboard.filters.searchTerm).toBe('modified');

      // Reset
      act(() => {
        result.current.resetTabStates();
      });

      expect(result.current.tabStates.dashboard.filters.searchTerm).toBe('');
    });
  });

  describe('clearPersistedData', () => {
    it('should clear all persisted data from localStorage', () => {
      localStorage.setItem('churnvision-active-tab', 'deepAnalysis');
      localStorage.setItem('churnvision-tab-states', '{}');
      localStorage.setItem('churnvision-shared-context', '{}');

      const { result } = renderHook(() => useTabState());

      act(() => {
        result.current.clearPersistedData();
      });

      expect(localStorage.getItem('churnvision-active-tab')).toBeNull();
      expect(localStorage.getItem('churnvision-tab-states')).toBeNull();
      expect(localStorage.getItem('churnvision-shared-context')).toBeNull();
    });
  });

  describe('getDashboardState', () => {
    it('should return dashboard state', () => {
      const { result } = renderHook(() => useTabState());

      const dashboardState = result.current.getDashboardState();

      expect(dashboardState).toBeDefined();
      expect(dashboardState.filters).toBeDefined();
      expect(dashboardState.sortConfig).toBeDefined();
    });
  });

  describe('getDeepAnalysisState', () => {
    it('should return deep analysis state', () => {
      const { result } = renderHook(() => useTabState());

      const deepAnalysisState = result.current.getDeepAnalysisState();

      expect(deepAnalysisState).toBeDefined();
      expect(deepAnalysisState.selectedAnalysisType).toBeDefined();
    });
  });

  describe('isTabActive', () => {
    it('should return true for active tab', () => {
      const { result } = renderHook(() => useTabState('dashboard'));

      expect(result.current.isTabActive('dashboard')).toBe(true);
      expect(result.current.isTabActive('deepAnalysis')).toBe(false);
    });

    it('should update when tab changes', () => {
      const { result } = renderHook(() => useTabState('dashboard'));

      act(() => {
        result.current.setActiveTab('deepAnalysis');
      });

      expect(result.current.isTabActive('dashboard')).toBe(false);
      expect(result.current.isTabActive('deepAnalysis')).toBe(true);
    });
  });
});
