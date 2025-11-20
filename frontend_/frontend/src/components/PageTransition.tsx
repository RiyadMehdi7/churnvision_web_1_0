import { motion, Variants } from 'framer-motion';
import React, { memo } from 'react';
import { LoadingOverlay } from './LoadingOverlay';

interface PageTransitionProps {
  children: React.ReactNode;
  isLoading?: boolean;
  loadingText?: string;
}

// Simplified page transitions optimized for performance
const getPageTransition = (): Variants => {
  // Single transition pattern for all pages to improve consistency and performance
  return {
    initial: { 
      opacity: 0,
      y: 10
    },
    enter: { 
      opacity: 1,
      y: 0,
      transition: {
        ease: "easeOut",
        duration: 0.15,
      }
    },
    exit: { 
      opacity: 0,
      y: -5,
      transition: {
        ease: "easeIn",
        duration: 0.1,
      }
    }
  };
};

export const PageTransition = memo(({ 
  children, 
  isLoading = false, 
  loadingText 
}: PageTransitionProps) => {
  const pageVariants = getPageTransition();
  
  // Removed performance logging to eliminate overhead
  
  return (
    <div 
      className="relative h-full w-full" 
      style={{ 
        minHeight: '100%',
        // Container optimizations for smooth scrolling
        contain: 'layout style paint',
        isolation: 'isolate'
      }}
    >
      <LoadingOverlay isLoading={isLoading} text={loadingText} />
      <motion.div
        initial="initial"
        animate="enter"
        exit="exit"
        variants={pageVariants}
        className="w-full h-full overflow-auto"
        style={{ 
          opacity: isLoading ? 0.4 : 1,
          pointerEvents: isLoading ? 'none' : 'auto',
          minHeight: '100%',
        }}
      >
        {children}
      </motion.div>
      
      {/* Performance indicator removed to improve performance */}
    </div>
  );
}); 