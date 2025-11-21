import React from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Brain, Database, Zap, TrendingUp, Users, BarChart3 } from 'lucide-react';

interface SmartLoadingProps {
  type: 'ai-analysis' | 'data-processing' | 'reasoning' | 'insights' | 'employees' | 'dashboard';
  message?: string;
  progress?: number;
}

const loadingConfigs = {
  'ai-analysis': {
    icon: Brain,
    color: 'from-purple-400 to-pink-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    messages: [
      'Analyzing employee patterns...',
      'Processing churn indicators...',
      'Generating AI insights...',
      'Calculating risk factors...'
    ]
  },
  'data-processing': {
    icon: Database,
    color: 'from-blue-400 to-cyan-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    messages: [
      'Processing employee data...',
      'Updating risk calculations...',
      'Syncing database...',
      'Optimizing queries...'
    ]
  },
  'reasoning': {
    icon: Zap,
    color: 'from-yellow-400 to-orange-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    messages: [
      'Deep-diving into employee reasoning...',
      'Analyzing behavioral patterns...',
      'Connecting data points...',
      'Building comprehensive profile...'
    ]
  },
  'insights': {
    icon: TrendingUp,
    color: 'from-green-400 to-emerald-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    messages: [
      'Generating actionable insights...',
      'Identifying key trends...',
      'Preparing recommendations...',
      'Finalizing analysis...'
    ]
  },
  'employees': {
    icon: Users,
    color: 'from-indigo-400 to-purple-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    messages: [
      'Loading employee profiles...',
      'Calculating churn probabilities...',
      'Organizing by risk levels...',
      'Preparing dashboard view...'
    ]
  },
  'dashboard': {
    icon: BarChart3,
    color: 'from-rose-400 to-pink-400',
    bgColor: 'bg-rose-50 dark:bg-rose-900/20',
    messages: [
      'Building your dashboard...',
      'Aggregating metrics...',
      'Preparing visualizations...',
      'Almost ready...'
    ]
  }
};

export const SmartLoadingState: React.FC<SmartLoadingProps> = ({ 
  type, 
  message, 
  progress 
}) => {
  const config = loadingConfigs[type];
  const Icon = config.icon;
  const [currentMessageIndex, setCurrentMessageIndex] = React.useState(0);
  const [displayMessage, setDisplayMessage] = React.useState(
    message || config.messages[0]
  );

  // Cycle through messages if no custom message provided
  React.useEffect(() => {
    if (message) return;
    
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % config.messages.length);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [message, config.messages.length]);

  React.useEffect(() => {
    if (!message) {
      setDisplayMessage(config.messages[currentMessageIndex]);
    }
  }, [currentMessageIndex, config.messages, message]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`${config.bgColor} rounded-2xl p-8 border border-gray-200 dark:border-gray-700 max-w-md mx-auto`}
    >
      {/* Animated Icon */}
      <div className="flex justify-center mb-6">
        <motion.div
          animate={{
            rotate: [0, 360],
            scale: [1, 1.1, 1]
          }}
          transition={{
            rotate: { duration: 3, repeat: Infinity, ease: "linear" },
            scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
          }}
          className={`w-16 h-16 rounded-full bg-gradient-to-br ${config.color} flex items-center justify-center shadow-lg`}
        >
          <Icon className="w-8 h-8 text-white" />
        </motion.div>
      </div>

      {/* Animated Message */}
      <AnimatePresence mode="wait">
        <motion.div
          key={displayMessage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {displayMessage}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This might take a moment...
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Progress Bar (if progress provided) */}
      {typeof progress === 'number' && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-2">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <motion.div
              className={`h-2 rounded-full bg-gradient-to-r ${config.color}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>
      )}

      {/* Animated Dots */}
      <div className="flex justify-center space-x-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`w-2 h-2 rounded-full bg-gradient-to-r ${config.color}`}
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.5, 1, 0.5]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.2
            }}
          />
        ))}
      </div>
    </motion.div>
  );
};

// Skeleton loaders with personality
export const SmartSkeleton: React.FC<{ type: 'card' | 'table' | 'chart' }> = ({ type }) => {
  const skeletonVariants: Variants = {
    pulse: {
      opacity: [0.5, 1, 0.5],
      transition: {
        duration: 1.5,
        repeat: Infinity,
      }
    }
  };

  if (type === 'card') {
    return (
      <motion.div
        variants={skeletonVariants}
        animate="pulse"
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="w-32 h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
        </div>
        <div className="space-y-2">
          <div className="w-24 h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="w-20 h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="w-20 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        </div>
      </motion.div>
    );
  }

  if (type === 'table') {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            variants={skeletonVariants}
            animate="pulse"
            style={{ animationDelay: `${i * 0.1}s` }}
            className="flex items-center space-x-4 p-4 bg-white dark:bg-gray-800 rounded-lg"
          >
            <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="w-32 h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="w-24 h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
            <div className="w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={skeletonVariants}
      animate="pulse"
      className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg h-64"
    >
      <div className="w-32 h-4 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="flex-1 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};