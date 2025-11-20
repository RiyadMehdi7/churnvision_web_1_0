import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TrainingReminderBannerProps {
    onDismiss?: () => void;
}

export const TrainingReminderBanner: React.FC<TrainingReminderBannerProps> = ({ onDismiss }) => {
    return (
        <AnimatePresence>
            <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800"
            >
                <div className="container mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <p className="text-sm font-medium">
                            Model training is recommended. New data has been uploaded since the last training session.
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <button className="text-sm font-semibold text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline">
                            Train Now
                        </button>
                        {onDismiss && (
                            <button
                                onClick={onDismiss}
                                className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
