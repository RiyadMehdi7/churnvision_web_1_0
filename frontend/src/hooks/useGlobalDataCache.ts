import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Employee } from '@/types/employee';

export const useGlobalDataCache = () => {
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ['employees'],
        queryFn: async () => {
            // In a real app, this would fetch from the backend
            // For now, we can mock it or fetch from a static file/endpoint
            try {
                // Attempt to fetch from backend if available
                return await api.get('/api/employees');
            } catch (e) {
                console.warn('Failed to fetch employees from backend, using mock data');
                return [];
            }
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    const refreshData = async () => {
        await queryClient.invalidateQueries({ queryKey: ['employees'] });
    };

    return {
        data: data as Employee[],
        isLoading,
        error,
        refreshData,
    };
};
