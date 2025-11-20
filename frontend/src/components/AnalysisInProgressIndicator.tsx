import React from 'react';
import { Bot } from 'lucide-react';

export const AnalysisInProgressIndicator = () => (
    <div className="p-4 mb-4 ml-2 mr-12 flex items-center space-x-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white flex-shrink-0">
            <Bot size={16} />
        </div>
        <div className="flex space-x-1">
            <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
            <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
        </div>
    </div>
);
