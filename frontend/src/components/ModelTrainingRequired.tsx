import React from 'react';
import { Brain, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ModelTrainingRequiredProps {
    status?: string;
    message?: string;
}

export const ModelTrainingRequired: React.FC<ModelTrainingRequiredProps> = ({ status, message }) => {
    return (
        <div className="flex items-center justify-center h-[60vh] p-6">
            <Card className="max-w-md w-full p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto text-blue-600 dark:text-blue-400">
                    <Brain className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                        Model Training Required
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                        To generate accurate predictions and insights, the AI model needs to be trained on your latest data.
                    </p>
                </div>

                <Button className="w-full gap-2">
                    Start Training
                    <ArrowRight className="w-4 h-4" />
                </Button>
            </Card>
        </div>
    );
};
