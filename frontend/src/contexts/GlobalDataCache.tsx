import React, { createContext, useContext, useState, useEffect } from 'react';
import { Employee } from '../types/employee';
import { TreatmentSuggestion } from '../types/treatment';

interface GlobalDataCacheType {
    employees: Employee[];
    setEmployees: (employees: Employee[]) => void;
    treatments: TreatmentSuggestion[];
    setTreatments: (treatments: TreatmentSuggestion[]) => void;
    refreshData: () => Promise<void>;
    lastUpdated: Date | null;
}

const GlobalDataCacheContext = createContext<GlobalDataCacheType | undefined>(undefined);

export const GlobalDataCacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [treatments, setTreatments] = useState<TreatmentSuggestion[]>([]);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const refreshData = async () => {
        // In a real app, we would fetch fresh data from the API here
        // For now, we'll just update the timestamp
        setLastUpdated(new Date());
    };

    return (
        <GlobalDataCacheContext.Provider value={{ employees, setEmployees, treatments, setTreatments, refreshData, lastUpdated }}>
            {children}
        </GlobalDataCacheContext.Provider>
    );
};

export const useGlobalDataCache = () => {
    const context = useContext(GlobalDataCacheContext);
    if (context === undefined) {
        throw new Error('useGlobalDataCache must be used within a GlobalDataCacheProvider');
    }
    return context;
};
