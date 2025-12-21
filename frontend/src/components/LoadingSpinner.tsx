import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import churnvisionLogo from '@/assets/providers/churnvision.svg';

interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'spinner' | 'dots' | 'pulse' | 'bars' | 'gradient';
  text?: string;
  className?: string;
  color?: 'primary' | 'secondary' | 'white' | 'gray';
}

const sizeClasses = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8'
};

const colorClasses = {
  primary: 'text-emerald-500',
  secondary: 'text-blue-500',
  white: 'text-white',
  gray: 'text-gray-400'
};

const SpinnerVariant = ({ size, color, className }: { size: string; color: string; className?: string }) => (
  <Loader2 className={`${size} ${color} animate-spin ${className || ''}`} />
);

const DotsVariant = ({ color }: { color: string }) => {
  return (
    <div className="flex space-x-1.5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={cn(
            "w-2 h-2 rounded-full",
            color === 'text-white' ? 'bg-white' : 'bg-gradient-to-br from-emerald-400 to-teal-500'
          )}
          animate={{
            y: [0, -6, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            delay: i * 0.12,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

const PulseVariant = ({ size }: { size: string }) => (
  <div className="relative">
    <div className={cn(size, "rounded-full bg-gradient-to-br from-emerald-400 to-teal-500")} />
    <motion.div
      className={cn(size, "absolute inset-0 rounded-full bg-emerald-400")}
      animate={{
        scale: [1, 1.8],
        opacity: [0.5, 0],
      }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: "easeOut"
      }}
    />
  </div>
);

const BarsVariant = ({ color }: { color: string }) => {
  return (
    <div className="flex space-x-1 items-end h-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className={cn(
            "w-1 rounded-full",
            color === 'text-white' ? 'bg-white' : 'bg-gradient-to-t from-emerald-500 to-teal-400'
          )}
          animate={{
            height: ['40%', '100%', '40%'],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

const GradientSpinnerVariant = ({ size }: { size: string }) => {
  const sizeNum = parseInt(size.match(/\d+/)?.[0] || '5') * 4;

  return (
    <div className={cn("relative", size)}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'conic-gradient(from 0deg, transparent, #10b981, #14b8a6, transparent)',
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: "linear"
        }}
      />
      <div
        className="absolute rounded-full bg-white dark:bg-gray-900"
        style={{
          inset: sizeNum > 20 ? 3 : 2,
        }}
      />
    </div>
  );
};

export function LoadingSpinner({
  size = 'md',
  variant = 'spinner',
  text,
  className = '',
  color = 'primary'
}: LoadingSpinnerProps) {
  const sizeClass = sizeClasses[size];
  const colorClass = colorClasses[color];

  const renderVariant = () => {
    switch (variant) {
      case 'dots':
        return <DotsVariant color={colorClass} />;
      case 'pulse':
        return <PulseVariant size={sizeClass} />;
      case 'bars':
        return <BarsVariant color={colorClass} />;
      case 'gradient':
        return <GradientSpinnerVariant size={sizeClass} />;
      default:
        return <SpinnerVariant size={sizeClass} color={colorClass} className={className} />;
    }
  };

  if (text) {
    return (
      <div className="flex items-center gap-3">
        {renderVariant()}
        <span className={cn("text-sm font-medium", colorClass)}>{text}</span>
      </div>
    );
  }

  return renderVariant();
}

// Preset loading states for common use cases - Enhanced versions
export const LoadingStates = {
  // For buttons
  ButtonLoading: ({ text = 'Loading...' }: { text?: string }) => (
    <div className="flex items-center gap-2">
      <motion.div
        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      />
      {text && <span className="text-sm">{text}</span>}
    </div>
  ),

  // For page loading - Premium branded version
  PageLoading: ({ text = 'Loading...' }: { text?: string }) => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center min-h-[300px] space-y-6"
    >
      {/* Animated logo container */}
      <div className="relative">
        <motion.div
          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg"
          animate={{
            boxShadow: [
              '0 10px 40px -10px rgba(16, 185, 129, 0.3)',
              '0 10px 40px -10px rgba(16, 185, 129, 0.5)',
              '0 10px 40px -10px rgba(16, 185, 129, 0.3)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <img 
            src={churnvisionLogo} 
            alt="ChurnVision Logo" 
            className="w-7 h-7"
          />
        </motion.div>

        {/* Pulse rings */}
        <motion.div
          className="absolute inset-0 rounded-2xl border-2 border-emerald-500/40"
          animate={{
            scale: [1, 1.5],
            opacity: [0.6, 0],
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <motion.div
          className="absolute inset-0 rounded-2xl border-2 border-emerald-500/40"
          animate={{
            scale: [1, 1.5],
            opacity: [0.6, 0],
          }}
          transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
        />
      </div>

      {/* Bouncing dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500"
            animate={{
              y: [0, -8, 0],
              scale: [1, 1.15, 1],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </div>

      {/* Text */}
      <motion.p
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-sm text-gray-500 dark:text-gray-400 font-medium"
      >
        {text}
      </motion.p>
    </motion.div>
  ),

  // For inline content
  InlineLoading: ({ text }: { text?: string }) => (
    <span className="inline-flex items-center gap-2">
      <motion.span
        className="inline-block w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-emerald-500 rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      />
      {text && <span className="text-sm text-gray-500 dark:text-gray-400">{text}</span>}
    </span>
  ),

  // For cards/components - With shimmer skeleton preview
  CardLoading: ({ text = 'Loading...', showSkeleton = false }: { text?: string; showSkeleton?: boolean }) => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center p-8 space-y-4"
    >
      {showSkeleton ? (
        <div className="w-full space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-md animate-pulse relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-md animate-pulse w-3/4 relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-md animate-pulse w-1/2 relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </div>
      ) : (
        <>
          <LoadingSpinner size="lg" variant="dots" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>
        </>
      )}
    </motion.div>
  ),

  // For data tables - With skeleton rows
  TableLoading: ({ rows = 5 }: { rows?: number }) => (
    <div className="w-full space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50"
        >
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4 relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
          </div>
          <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </motion.div>
      ))}
    </div>
  ),

  // For overlays - Premium glassmorphism version
  OverlayLoading: ({ text = 'Processing...' }: { text?: string }) => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/20"
      >
        <div className="flex flex-col items-center space-y-5">
          {/* Gradient spinner */}
          <div className="relative w-12 h-12">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'conic-gradient(from 0deg, transparent, #10b981, #14b8a6, transparent)',
              }}
              animate={{ rotate: 360 }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear"
              }}
            />
            <div className="absolute inset-1 rounded-full bg-white dark:bg-gray-900" />
          </div>

          <div className="text-center">
            <p className="text-gray-800 dark:text-gray-200 font-semibold">{text}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Please wait...</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  ),

  // Full screen loading - For initial app load
  FullScreenLoading: ({ message = 'Loading ChurnVision...' }: { message?: string }) => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white dark:bg-gray-950"
    >
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent rounded-full blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-teal-500/10 via-transparent to-transparent rounded-full blur-3xl"
          animate={{
            x: [0, -100, 0],
            y: [0, -50, 0],
          }}
          transition={{ duration: 8, repeat: Infinity, delay: 0.5 }}
        />
      </div>

      {/* Logo */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="relative mb-8"
      >
        <motion.div
          className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-2xl"
          animate={{
            boxShadow: [
              '0 20px 60px -15px rgba(16, 185, 129, 0.3)',
              '0 20px 60px -15px rgba(16, 185, 129, 0.5)',
              '0 20px 60px -15px rgba(16, 185, 129, 0.3)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <img 
            src={churnvisionLogo} 
            alt="ChurnVision Logo" 
            className="w-10 h-10"
          />
        </motion.div>

        {/* Pulse rings */}
        {[0, 0.5, 1].map((delay, i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-3xl border-2 border-emerald-500/30"
            animate={{
              scale: [1, 1.8],
              opacity: [0.5, 0],
            }}
            transition={{ duration: 2, repeat: Infinity, delay }}
          />
        ))}
      </motion.div>

      {/* Loading indicator and text */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500"
              animate={{
                y: [0, -10, 0],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
          ))}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          {message}
        </p>
      </motion.div>
    </motion.div>
  ),

  // Dashboard skeleton loading
  DashboardLoading: () => (
    <div className="space-y-6 p-6 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
          <div className="h-4 w-64 bg-gray-200 dark:bg-gray-800 rounded relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </div>
        <div className="h-10 w-32 bg-gray-200 dark:bg-gray-800 rounded-lg relative overflow-hidden">
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-3 flex-1">
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded relative overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>
                <div className="h-8 w-20 bg-gray-200 dark:bg-gray-800 rounded relative overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>
                <div className="h-3 w-32 bg-gray-200 dark:bg-gray-800 rounded relative overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>
              </div>
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-lg relative overflow-hidden">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart area */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
          <div className="h-5 w-40 bg-gray-200 dark:bg-gray-800 rounded mb-6 relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
          <div className="h-64 bg-gray-100 dark:bg-gray-800/50 rounded-lg relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>
        </div>

        {/* List area */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-800 rounded relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full relative overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  </div>
                  <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  ),
};

// Simple loading overlay - consolidated from LoadingOverlay.tsx
interface LoadingOverlayProps {
  isLoading: boolean;
  text?: string;
}

const OptimizedSpinner = memo(() => (
  <div className="relative w-10 h-10">
    <div className="absolute inset-0 rounded-full border-2 border-gray-200" />
    <div
      className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-500"
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
          className="fixed inset-0 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm z-50 flex items-center justify-center"
        >
          <div className="flex flex-col items-center gap-3">
            <OptimizedSpinner />
            <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

LoadingOverlay.displayName = 'LoadingOverlay';

// Contextual loading messages for different operations
const CONTEXTUAL_MESSAGES: Record<string, Record<string, string>> = {
  'file-upload': {
    'selecting': 'Select a file to upload...',
    'uploading': 'Uploading your file...',
    'parsing': 'Parsing file contents...',
    'validating': 'Validating data structure...',
    'mapping': 'Auto-mapping columns...',
    'saving': 'Saving to database...',
    'complete': 'Upload complete!',
  },
  'training': {
    'preparing': 'Preparing training data...',
    'feature-engineering': 'Engineering features...',
    'training': 'Training ML model...',
    'evaluating': 'Evaluating model performance...',
    'saving': 'Saving trained model...',
    'complete': 'Training complete!',
  },
  'prediction': {
    'loading': 'Loading employee data...',
    'calculating': 'Calculating risk scores...',
    'analyzing': 'Analyzing patterns...',
    'generating': 'Generating insights...',
    'complete': 'Analysis complete!',
  },
  'chat': {
    'connecting': 'Connecting to AI assistant...',
    'thinking': 'AI is thinking...',
    'generating': 'Generating response...',
    'streaming': 'Receiving response...',
  },
  'data-fetch': {
    'loading': 'Loading data...',
    'processing': 'Processing results...',
    'filtering': 'Applying filters...',
    'sorting': 'Sorting results...',
    'complete': 'Data loaded!',
  },
  'export': {
    'preparing': 'Preparing export...',
    'generating': 'Generating file...',
    'downloading': 'Starting download...',
    'complete': 'Export complete!',
  },
};

export type LoadingContext = keyof typeof CONTEXTUAL_MESSAGES;
export type LoadingStep<T extends LoadingContext> = keyof typeof CONTEXTUAL_MESSAGES[T];

interface ContextualLoadingSpinnerProps {
  context: LoadingContext;
  step?: string;
  progress?: number;
  showProgress?: boolean;
  variant?: 'spinner' | 'dots' | 'pulse' | 'bars' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ContextualLoadingSpinner = memo(({
  context,
  step,
  progress,
  showProgress = true,
  variant = 'pulse',
  size = 'md',
  className,
}: ContextualLoadingSpinnerProps) => {
  const message = step
    ? CONTEXTUAL_MESSAGES[context]?.[step] || `${step.charAt(0).toUpperCase() + step.slice(1).replace(/-/g, ' ')}...`
    : 'Processing...';

  const sizeClasses = {
    sm: 'gap-2',
    md: 'gap-3',
    lg: 'gap-4',
  };

  const progressBarWidths = {
    sm: 'w-32',
    md: 'w-48',
    lg: 'w-64',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className={cn(
        "flex flex-col items-center",
        sizeClasses[size],
        className
      )}
    >
      <LoadingSpinner variant={variant} size={size} />

      <motion.span
        key={message}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-sm font-medium text-gray-600 dark:text-gray-400"
      >
        {message}
      </motion.span>

      {showProgress && progress !== undefined && (
        <div className={cn("h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden", progressBarWidths[size])}>
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
      )}

      {showProgress && progress !== undefined && (
        <span className="text-xs text-gray-500 dark:text-gray-500">
          {Math.round(progress)}%
        </span>
      )}
    </motion.div>
  );
});

ContextualLoadingSpinner.displayName = 'ContextualLoadingSpinner';

// Contextual overlay loading - for blocking operations
interface ContextualLoadingOverlayProps {
  isLoading: boolean;
  context: LoadingContext;
  step?: string;
  progress?: number;
}

export const ContextualLoadingOverlay = memo(({
  isLoading,
  context,
  step,
  progress,
}: ContextualLoadingOverlayProps) => {
  return (
    <AnimatePresence mode="wait">
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm z-50 flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-200 dark:border-gray-800"
          >
            <ContextualLoadingSpinner
              context={context}
              step={step}
              progress={progress}
              size="lg"
              variant="gradient"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ContextualLoadingOverlay.displayName = 'ContextualLoadingOverlay';

// Helper to get context message programmatically
export function getContextualMessage(context: LoadingContext, step: string): string {
  return CONTEXTUAL_MESSAGES[context]?.[step] || `${step.charAt(0).toUpperCase() + step.slice(1).replace(/-/g, ' ')}...`;
}
