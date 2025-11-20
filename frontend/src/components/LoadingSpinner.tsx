import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = () => (
    <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
    </div>
);

export const LoadingStates = {
    Page: () => (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            <p className="text-gray-500 dark:text-gray-400">Loading dashboard...</p>
        </div>
    ),
    PageLoading: ({ text }: { text?: string }) => (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            <p className="text-gray-500 dark:text-gray-400">{text || "Loading..."}</p>
        </div>
    ),
    Card: () => (
        <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
    ),
    Chart: () => (
        <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
    )
};
