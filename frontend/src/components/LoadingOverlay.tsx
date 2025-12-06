import { motion, AnimatePresence } from 'framer-motion';
import { memo } from 'react';

interface LoadingOverlayProps {
  isLoading: boolean;
  text?: string;
}

// Clean, minimal spinner
const OptimizedSpinner = memo(() => (
  <div className="relative w-10 h-10">
    <div
      className="absolute inset-0 rounded-full border-2 border-gray-200"
    />
    <div
      className="absolute inset-0 rounded-full border-2 border-transparent border-t-app-green"
      style={{
        animation: 'spin 0.8s linear infinite',
        willChange: 'transform',
      }}
    />
  </div>
));

OptimizedSpinner.displayName = 'OptimizedSpinner';

export const LoadingOverlay = memo(({ isLoading, text = 'Loading...' }: LoadingOverlayProps) => {
  return (
    <AnimatePresence mode="wait">
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center"
        >
          <div className="flex flex-col items-center gap-3">
            <OptimizedSpinner />
            <p className="text-sm text-gray-500">{text}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

LoadingOverlay.displayName = 'LoadingOverlay'; 