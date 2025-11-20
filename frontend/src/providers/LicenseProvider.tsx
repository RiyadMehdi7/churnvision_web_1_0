import React, { createContext, useContext, useState, useEffect } from 'react';

export type LicenseTier = 'free' | 'pro' | 'enterprise';

interface LicenseData {
    key: string;
    tier: LicenseTier;
    expiresAt: string | null;
    features: string[];
}

interface LicenseContextType {
    licenseStatus: 'active' | 'expired' | 'invalid' | 'none';
    licenseData: LicenseData | null;
    licenseTier: LicenseTier;
    isLoading: boolean;
    error: string | null;
    gracePeriodEnds: string | null;
    activateLicense: (key: string) => Promise<boolean>;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [licenseStatus, setLicenseStatus] = useState<'active' | 'expired' | 'invalid' | 'none'>('active');
    const [licenseData, setLicenseData] = useState<LicenseData | null>({
        key: 'DEMO-LICENSE-KEY',
        tier: 'enterprise',
        expiresAt: '2025-12-31',
        features: ['all']
    });
    const [isLoading, setIsLoading] = useState(false);

    const activateLicense = async (key: string) => {
        setIsLoading(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIsLoading(false);
        return true;
    };

    return (
        <LicenseContext.Provider value={{
            licenseStatus,
            licenseData,
            licenseTier: licenseData?.tier || 'free',
            isLoading,
            error: null,
            gracePeriodEnds: null,
            activateLicense
        }}>
            {children}
        </LicenseContext.Provider>
    );
};

export const useLicense = () => {
    const context = useContext(LicenseContext);
    if (context === undefined) {
        throw new Error('useLicense must be used within a LicenseProvider');
    }
    return context;
};

export const getLicenseTierDisplayName = (tier: LicenseTier) => {
    switch (tier) {
        case 'enterprise': return 'Enterprise';
        case 'pro': return 'Pro';
        default: return 'Free';
    }
};
