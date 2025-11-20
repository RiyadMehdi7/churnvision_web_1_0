import React from 'react';
import { Card } from '@/components/ui/card';

const EmployeeNetworkGraph: React.FC = () => {
    return (
        <Card className="h-[400px] flex items-center justify-center bg-gray-50 dark:bg-gray-800/50 border-dashed">
            <div className="text-center text-gray-500 dark:text-gray-400">
                <p className="font-medium">Network Graph Visualization</p>
                <p className="text-sm mt-1">Interactive graph view coming soon</p>
            </div>
        </Card>
    );
};

export default EmployeeNetworkGraph;
