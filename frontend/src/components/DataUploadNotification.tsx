import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, X } from 'lucide-react';

interface DataUploadNotificationProps {
    show: boolean;
    onClose: () => void;
    fileName?: string;
}

export const DataUploadNotification: React.FC<DataUploadNotificationProps> = ({ show, onClose, fileName }) => {
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0, y: 50, x: '-50%' }}
                    animate={{ opacity: 1, y: 0, x: '-50%' }}
                    exit={{ opacity: 0, y: 50, x: '-50%' }}
                    className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50"
                >
                    <div className="bg-gray-900 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-400" />
                            <span className="font-medium">Data Updated</span>
                        </div>
                        {fileName && <span className="text-gray-400 text-sm">| {fileName}</span>}
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
