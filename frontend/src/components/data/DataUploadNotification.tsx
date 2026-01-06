import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Info } from 'lucide-react';

interface DataUploadNotificationProps {
  show: boolean;
  message: string;
  onClose: () => void;
}

export const DataUploadNotification: React.FC<DataUploadNotificationProps> = ({
  show,
  message,
  onClose
}) => {
  useEffect(() => {
    if (show) {
      // Auto-dismiss after 30 seconds
      const timer = setTimeout(() => {
        onClose();
      }, 30000);
      
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-5 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4"
        >
          <div className="bg-blue-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <Info className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 text-sm font-medium">{message}</span>
            <button
              onClick={onClose}
              className="p-1 hover:bg-blue-600 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};