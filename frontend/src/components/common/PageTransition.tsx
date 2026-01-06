import { motion, Variants, AnimatePresence } from 'framer-motion';
import React, { memo, useMemo } from 'react';
import { LoadingOverlay } from '@/components/common/LoadingSpinner';
import { easing, durations } from '@/lib/animations';

interface PageTransitionProps {
  children: React.ReactNode;
  isLoading?: boolean;
  loadingText?: string;
  /** Animation variant - 'default' is smooth, 'fade' is simpler, 'slide' adds direction */
  variant?: 'default' | 'fade' | 'slide' | 'scale' | 'blur';
  /** Custom transition duration multiplier (1 = normal, 0.5 = fast, 2 = slow) */
  speed?: number;
}

/**
 * Premium page transition variants with carefully tuned bezier curves
 * for a luxurious, smooth feel
 */
const createPageVariants = (variant: string, speed: number): Variants => {
  const baseDuration = durations.smooth * speed;
  const exitDuration = durations.fast * speed;

  const variants: Record<string, Variants> = {
    // Default: subtle slide + fade with premium easing
    default: {
      initial: {
        opacity: 0,
        y: 16,
        scale: 0.99,
      },
      enter: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
          duration: baseDuration,
          ease: easing.easeOutExpo,
          opacity: { duration: baseDuration * 0.8, ease: easing.easeOutQuart },
          scale: { duration: baseDuration * 1.1, ease: easing.easeOutQuart },
        }
      },
      exit: {
        opacity: 0,
        y: -8,
        scale: 0.995,
        transition: {
          duration: exitDuration,
          ease: easing.luxuryExit,
        }
      }
    },

    // Fade: simple, elegant fade
    fade: {
      initial: { opacity: 0 },
      enter: {
        opacity: 1,
        transition: {
          duration: baseDuration,
          ease: easing.silky,
        }
      },
      exit: {
        opacity: 0,
        transition: {
          duration: exitDuration,
          ease: easing.luxuryExit,
        }
      }
    },

    // Slide: directional movement
    slide: {
      initial: {
        opacity: 0,
        x: 24,
      },
      enter: {
        opacity: 1,
        x: 0,
        transition: {
          duration: baseDuration,
          ease: easing.easeOutExpo,
          opacity: { duration: baseDuration * 0.7 },
        }
      },
      exit: {
        opacity: 0,
        x: -16,
        transition: {
          duration: exitDuration,
          ease: easing.luxuryExit,
        }
      }
    },

    // Scale: zoom effect
    scale: {
      initial: {
        opacity: 0,
        scale: 0.94,
      },
      enter: {
        opacity: 1,
        scale: 1,
        transition: {
          duration: baseDuration,
          ease: easing.easeOutBackSubtle,
        }
      },
      exit: {
        opacity: 0,
        scale: 0.98,
        transition: {
          duration: exitDuration,
          ease: easing.luxuryExit,
        }
      }
    },

    // Blur: premium blur + fade effect
    blur: {
      initial: {
        opacity: 0,
        filter: 'blur(8px)',
        y: 12,
      },
      enter: {
        opacity: 1,
        filter: 'blur(0px)',
        y: 0,
        transition: {
          duration: baseDuration * 1.2,
          ease: easing.easeOutExpo,
          filter: { duration: baseDuration * 0.9 },
        }
      },
      exit: {
        opacity: 0,
        filter: 'blur(4px)',
        y: -6,
        transition: {
          duration: exitDuration,
          ease: easing.luxuryExit,
        }
      }
    },
  };

  return variants[variant] || variants.default;
};

export const PageTransition = memo(({
  children,
  isLoading = false,
  loadingText,
  variant = 'default',
  speed = 1,
}: PageTransitionProps) => {
  const pageVariants = useMemo(
    () => createPageVariants(variant, speed),
    [variant, speed]
  );

  return (
    <div
      className="relative h-full w-full"
      style={{
        minHeight: '100%',
        contain: 'layout style paint',
        isolation: 'isolate',
      }}
    >
      <AnimatePresence mode="wait">
        {isLoading && <LoadingOverlay isLoading={isLoading} text={loadingText} />}
      </AnimatePresence>

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
          willChange: 'transform, opacity',
        }}
      >
        {children}
      </motion.div>
    </div>
  );
});

PageTransition.displayName = 'PageTransition'; 