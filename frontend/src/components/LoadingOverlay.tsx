import { motion, AnimatePresence } from 'framer-motion';
import { memo } from 'react';

interface LoadingOverlayProps {
  isLoading: boolean;
  text?: string;
}

// GPU-accelerated spinner component
const OptimizedSpinner = memo(() => (
  <div className="relative">
    {/* Outer spinner - GPU accelerated */}
    <div 
      className="w-16 h-16 border-4 border-app-green/20 border-t-app-green rounded-full"
      style={{
        animation: 'spin 1s linear infinite',
        willChange: 'transform',
        transform: 'translate3d(0, 0, 0)', // Force GPU layer
        backfaceVisibility: 'hidden',
      }}
    />
    {/* Inner spinner - counter-rotating for smooth effect */}
    <div 
      className="absolute inset-0 flex items-center justify-center"
      style={{
        willChange: 'transform',
        transform: 'translate3d(0, 0, 0)',
      }}
    >
      <div 
        className="w-8 h-8 border-4 border-app-green/40 border-t-app-green rounded-full"
        style={{
          animation: 'spin 0.6s linear infinite reverse',
          willChange: 'transform',
          transform: 'translate3d(0, 0, 0)',
          backfaceVisibility: 'hidden',
        }}
      />
    </div>
  </div>
));

OptimizedSpinner.displayName = 'OptimizedSpinner';

export const LoadingOverlay = memo(({ isLoading, text = 'Loading...' }: LoadingOverlayProps) => {
  return (
    <AnimatePresence mode="wait">
      {isLoading && (
        <motion.div
          initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          animate={{ 
            opacity: 1, 
            backdropFilter: 'blur(4px)',
            transition: {
              duration: 0.15,
              ease: [0.25, 0.46, 0.45, 0.94]
            }
          }}
          exit={{ 
            opacity: 0, 
            backdropFilter: 'blur(0px)',
            transition: {
              duration: 0.1,
              ease: [0.55, 0.06, 0.68, 0.19]
            }
          }}
          className="fixed inset-0 bg-white/80 z-50 flex items-center justify-center"
          style={{
            // GPU acceleration for overlay
            willChange: 'opacity, backdrop-filter',
            transform: 'translate3d(0, 0, 0)',
            backfaceVisibility: 'hidden',
            // Performance optimizations
            contain: 'layout style paint',
            isolation: 'isolate',
          }}
        >
          <motion.div
            initial={{ 
              opacity: 0, 
              y: 20, 
              scale: 0.9,
              rotateX: -10
            }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              rotateX: 0,
              transition: {
                delay: 0.05,
                duration: 0.2,
                ease: [0.25, 0.46, 0.45, 0.94]
              }
            }}
            exit={{ 
              opacity: 0, 
              y: -10, 
              scale: 0.95,
              transition: {
                duration: 0.1,
                ease: [0.55, 0.06, 0.68, 0.19]
              }
            }}
            className="text-center"
            style={{
              // GPU acceleration for content
              willChange: 'transform, opacity',
              transform: 'translate3d(0, 0, 0)',
              backfaceVisibility: 'hidden',
              perspective: 1000,
              transformStyle: 'preserve-3d',
            }}
          >
            <OptimizedSpinner />
            
            <motion.p 
              initial={{ opacity: 0, y: 5 }}
              animate={{ 
                opacity: 1, 
                y: 0,
                transition: {
                  delay: 0.1,
                  duration: 0.15,
                  ease: [0.25, 0.46, 0.45, 0.94]
                }
              }}
              exit={{
                opacity: 0,
                y: -5,
                transition: {
                  duration: 0.1
                }
              }}
              className="mt-4 text-gray-600 font-medium"
              style={{
                willChange: 'transform, opacity',
                transform: 'translate3d(0, 0, 0)',
              }}
            >
              {text}
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

LoadingOverlay.displayName = 'LoadingOverlay'; 