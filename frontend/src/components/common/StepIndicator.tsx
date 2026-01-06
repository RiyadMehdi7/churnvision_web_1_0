import { motion } from 'framer-motion';
import { Check, Circle, Loader2 } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';

export interface Step {
  id: string;
  label: string;
  description?: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: string;
  completedSteps: string[];
  orientation?: 'horizontal' | 'vertical';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeConfig = {
  sm: {
    circle: 'w-8 h-8',
    icon: 'w-4 h-4',
    label: 'text-xs',
    description: 'text-xs',
    connector: 'h-0.5',
    verticalConnector: 'w-0.5 h-8',
  },
  md: {
    circle: 'w-10 h-10',
    icon: 'w-5 h-5',
    label: 'text-sm',
    description: 'text-xs',
    connector: 'h-0.5',
    verticalConnector: 'w-0.5 h-12',
  },
  lg: {
    circle: 'w-12 h-12',
    icon: 'w-6 h-6',
    label: 'text-base',
    description: 'text-sm',
    connector: 'h-1',
    verticalConnector: 'w-1 h-16',
  },
};

export const StepIndicator = memo(({
  steps,
  currentStep,
  completedSteps,
  orientation = 'horizontal',
  size = 'md',
  className,
}: StepIndicatorProps) => {
  const config = sizeConfig[size];
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      className={cn(
        isHorizontal
          ? 'flex items-start justify-between w-full'
          : 'flex flex-col items-start',
        className
      )}
    >
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = step.id === currentStep;
        const isUpcoming = !isCompleted && !isCurrent;
        const isLast = index === steps.length - 1;

        return (
          <div
            key={step.id}
            className={cn(
              isHorizontal
                ? 'flex flex-col items-center flex-1'
                : 'flex items-start gap-4'
            )}
          >
            {/* Step content row */}
            <div
              className={cn(
                isHorizontal
                  ? 'flex items-center w-full'
                  : 'flex flex-col items-center'
              )}
            >
              {/* Circle indicator */}
              <motion.div
                initial={false}
                animate={{
                  scale: isCurrent ? 1.05 : 1,
                  boxShadow: isCurrent
                    ? '0 0 0 4px rgba(16, 185, 129, 0.2)'
                    : '0 0 0 0px rgba(16, 185, 129, 0)',
                }}
                className={cn(
                  config.circle,
                  'rounded-full flex items-center justify-center border-2 transition-colors duration-200 relative z-10',
                  isCompleted && 'bg-emerald-500 border-emerald-500 text-white',
                  isCurrent && 'border-emerald-500 text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10',
                  isUpcoming && 'border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-600 bg-white dark:bg-gray-900'
                )}
              >
                {isCompleted ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  >
                    <Check className={config.icon} />
                  </motion.div>
                ) : isCurrent ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 className={config.icon} />
                  </motion.div>
                ) : (
                  <span className={cn('font-semibold', config.label)}>
                    {index + 1}
                  </span>
                )}
              </motion.div>

              {/* Connector line - horizontal */}
              {isHorizontal && !isLast && (
                <div className="flex-1 mx-2">
                  <div
                    className={cn(
                      config.connector,
                      'w-full rounded-full transition-colors duration-300',
                      index < currentIndex
                        ? 'bg-emerald-500'
                        : 'bg-gray-200 dark:bg-gray-800'
                    )}
                  >
                    {index === currentIndex - 1 && (
                      <motion.div
                        className="h-full bg-emerald-500 rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Labels - horizontal */}
            {isHorizontal && (
              <div className="mt-3 text-center px-2">
                <p
                  className={cn(
                    config.label,
                    'font-medium transition-colors',
                    isCurrent && 'text-emerald-600 dark:text-emerald-400',
                    isCompleted && 'text-gray-700 dark:text-gray-300',
                    isUpcoming && 'text-gray-400 dark:text-gray-600'
                  )}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p
                    className={cn(
                      config.description,
                      'mt-1 text-gray-500 dark:text-gray-500 max-w-[120px] mx-auto'
                    )}
                  >
                    {step.description}
                  </p>
                )}
              </div>
            )}

            {/* Labels and connector - vertical */}
            {!isHorizontal && (
              <div className="flex-1 pb-6">
                <p
                  className={cn(
                    config.label,
                    'font-medium transition-colors',
                    isCurrent && 'text-emerald-600 dark:text-emerald-400',
                    isCompleted && 'text-gray-700 dark:text-gray-300',
                    isUpcoming && 'text-gray-400 dark:text-gray-600'
                  )}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p
                    className={cn(
                      config.description,
                      'mt-1 text-gray-500 dark:text-gray-500'
                    )}
                  >
                    {step.description}
                  </p>
                )}
                {/* Vertical connector */}
                {!isLast && (
                  <div
                    className={cn(
                      'absolute left-5 mt-2',
                      config.verticalConnector,
                      'rounded-full',
                      index < currentIndex
                        ? 'bg-emerald-500'
                        : 'bg-gray-200 dark:bg-gray-800'
                    )}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

StepIndicator.displayName = 'StepIndicator';

// Preset step configurations for common workflows
export const UPLOAD_WORKFLOW_STEPS: Step[] = [
  { id: 'select', label: 'Select File', description: 'Choose CSV or Excel' },
  { id: 'mapping', label: 'Map Columns', description: 'Match to fields' },
  { id: 'validate', label: 'Validate', description: 'Check data quality' },
  { id: 'upload', label: 'Upload', description: 'Save to database' },
  { id: 'train', label: 'Train Model', description: 'Generate predictions' },
];

export const TRAINING_WORKFLOW_STEPS: Step[] = [
  { id: 'preparing', label: 'Preparing', description: 'Loading data' },
  { id: 'feature-engineering', label: 'Features', description: 'Engineering' },
  { id: 'training', label: 'Training', description: 'Model training' },
  { id: 'evaluating', label: 'Evaluating', description: 'Performance check' },
  { id: 'complete', label: 'Complete', description: 'Ready to use' },
];

// Compact step indicator for limited space
interface CompactStepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  label?: string;
  className?: string;
}

export const CompactStepIndicator = memo(({
  currentStep,
  totalSteps,
  label,
  className,
}: CompactStepIndicatorProps) => {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <motion.div
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              i < currentStep
                ? 'bg-emerald-500 w-6'
                : i === currentStep
                ? 'bg-emerald-500/50 w-4'
                : 'bg-gray-300 dark:bg-gray-700 w-2'
            )}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
          />
        ))}
      </div>
      {label && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {label}
        </span>
      )}
    </div>
  );
});

CompactStepIndicator.displayName = 'CompactStepIndicator';
