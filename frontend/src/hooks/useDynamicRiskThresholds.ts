import { useState, useEffect } from 'react';

export const useDynamicRiskRanges = () => {
    const [ranges, setRanges] = useState({
        high: { min: 0.7, max: 1.0, color: 'rgba(239, 68, 68, 0.1)' },
        medium: { min: 0.4, max: 0.7, color: 'rgba(245, 158, 11, 0.1)' },
        low: { min: 0.0, max: 0.4, color: 'rgba(34, 197, 94, 0.1)' },
    });

    // In a real app, this might fetch from an API or configuration
    useEffect(() => {
        // Simulate loading or dynamic updates
    }, []);

    return ranges;
};
