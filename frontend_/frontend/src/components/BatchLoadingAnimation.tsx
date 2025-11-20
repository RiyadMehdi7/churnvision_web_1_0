import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Database, Zap, CheckCircle, Users } from 'lucide-react';

interface BatchLoadingAnimationProps {
  isLoading: boolean;
  totalItems: number;
  processedItems: number;
  currentItem?: string;
  type?: 'reasoning' | 'data-processing' | 'analysis';
  onComplete?: () => void;
}

interface LoadingStep {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  duration: number;
  completed: boolean;
}

export const BatchLoadingAnimation: React.FC<BatchLoadingAnimationProps> = ({
  isLoading,
  totalItems,
  processedItems,
  currentItem,
  type: _ = 'reasoning' as const,
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [, setAnimationPhase] = useState<'preparing' | 'processing' | 'completing'>('preparing');
  
  const progress = totalItems > 0 ? (processedItems / totalItems) * 100 : 0;
  
  const steps: LoadingStep[] = [
    {
      id: 'initialize',
      label: 'Initializing batch process...',
      icon: Database,
      duration: 500,
      completed: progress > 0
    },
    {
      id: 'analyze',
      label: 'Analyzing employee patterns...',
      icon: Brain,
      duration: 1000,
      completed: progress > 25
    },
    {
      id: 'process',
      label: 'Processing reasoning data...',
      icon: Zap,
      duration: 2000,
      completed: progress > 75
    },
    {
      id: 'finalize',
      label: 'Finalizing results...',
      icon: CheckCircle,
      duration: 500,
      completed: progress >= 100
    }
  ];

  // Update animation phase based on progress
  useEffect(() => {
    if (progress === 0 && isLoading) {
      setAnimationPhase('preparing');
    } else if (progress > 0 && progress < 100) {
      setAnimationPhase('processing');
    } else if (progress >= 100) {
      setAnimationPhase('completing');
      setTimeout(() => {
        onComplete?.();
      }, 1000);
    }
  }, [progress, isLoading, onComplete]);

  // Auto-advance steps based on progress
  useEffect(() => {
    const completedSteps = steps.filter(step => step.completed).length;
    if (completedSteps > currentStep) {
      const timer = setTimeout(() => {
        setCurrentStep(completedSteps - 1);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [steps, currentStep]);

  if (!isLoading && progress === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ y: 50 }}
          animate={{ y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              animate={{ 
                rotate: [0, 360],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                rotate: { duration: 3, repeat: Infinity, ease: "linear" },
                scale: { duration: 2, repeat: Infinity }
              }}
              className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg"
            >
              <Brain className="w-8 h-8 text-white" />
            </motion.div>
            
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Processing Batch Reasoning
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Analyzing {totalItems} employees with AI insights
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>Progress</span>
              <span>{processedItems} / {totalItems}</span>
            </div>
            
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full relative"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                {/* Animated shimmer effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />
              </motion.div>
            </div>
            
            <div className="text-center mt-2">
              <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {Math.round(progress)}%
              </span>
            </div>
          </div>

          {/* Current Processing Item */}
          {currentItem && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
            >
              <div className="flex items-center space-x-3">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center"
                >
                  <Users className="w-4 h-4 text-white" />
                </motion.div>
                <div>
                  <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
                    Currently Processing
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-300">
                    {currentItem}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Processing Steps */}
          <div className="space-y-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = step.completed;
              
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-all ${
                    isActive 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' 
                      : isCompleted
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      : 'bg-gray-50 dark:bg-gray-700/50'
                  }`}
                >
                  <motion.div
                    animate={isActive ? { 
                      rotate: [0, 360],
                      scale: [1, 1.1, 1]
                    } : {}}
                    transition={isActive ? { 
                      rotate: { duration: 2, repeat: Infinity, ease: "linear" },
                      scale: { duration: 1, repeat: Infinity }
                    } : {}}
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isCompleted 
                        ? 'bg-green-500' 
                        : isActive 
                        ? 'bg-blue-500' 
                        : 'bg-gray-400'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-white" />
                  </motion.div>
                  
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      isCompleted 
                        ? 'text-green-800 dark:text-green-200' 
                        : isActive 
                        ? 'text-blue-800 dark:text-blue-200' 
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {step.label}
                    </p>
                  </div>
                  
                  {isCompleted && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                    >
                      <CheckCircle className="w-3 h-3 text-white" />
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Completion Message */}
          {progress >= 100 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 text-center"
            >
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Batch processing completed successfully!
              </p>
              <p className="text-xs text-green-600 dark:text-green-300 mt-1">
                All {totalItems} employees have been analyzed
              </p>
            </motion.div>
          )}

          {/* Processing Stats */}
          <div className="mt-6 grid grid-cols-3 gap-4 text-center">
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {totalItems}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Total Items
              </div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {processedItems}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Processed
              </div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {totalItems - processedItems}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Remaining
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};