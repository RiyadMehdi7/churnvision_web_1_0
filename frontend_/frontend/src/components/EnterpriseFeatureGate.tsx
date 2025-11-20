import React from 'react';
import { motion } from 'framer-motion';
import { Crown, Sparkles, Zap, Lock } from 'lucide-react';
import { useLicense } from '../providers/LicenseProvider';
import { cn } from '../lib/utils';

interface EnterpriseFeatureGateProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showUpgradePrompt?: boolean;
  className?: string;
  description?: string;
}

export const EnterpriseFeatureGate: React.FC<EnterpriseFeatureGateProps> = ({
  feature,
  children,
  fallback,
  showUpgradePrompt = true,
  className,
  description
}) => {
  const { licenseTier, hasAccess } = useLicense();
  
  const isEnterprise = licenseTier === 'enterprise';
  const hasFeatureAccess = hasAccess(feature);
  
  // If user has access, render the children
  if (isEnterprise && hasFeatureAccess) {
    return <>{children}</>;
  }
  
  // If fallback is provided and user doesn't have access, show fallback
  if (fallback) {
    return <>{fallback}</>;
  }
  
  // Show upgrade prompt by default
  if (showUpgradePrompt) {
    return (
      <EnterpriseUpgradePrompt 
        feature={feature}
        className={className}
        description={description}
      />
    );
  }
  
  // Don't render anything if no fallback and no upgrade prompt
  return null;
};

interface EnterpriseUpgradePromptProps {
  feature: string;
  className?: string;
  description?: string;
  compact?: boolean;
}

export const EnterpriseUpgradePrompt: React.FC<EnterpriseUpgradePromptProps> = ({
  feature,
  className,
  description,
  compact = false
}) => {
  const getFeatureDisplayName = (feature: string): string => {
    const featureNames: Record<string, string> = {
      'dashboard-customization': 'Dashboard Customization',
      'ai-assistant': 'AI Assistant',
      'playground': 'AI Playground',
      'advanced-analytics': 'Advanced Analytics',
      'custom-models': 'Custom Models',
      'unlimited-users': 'Unlimited Users',
      'priority-support': 'Priority Support'
    };
    
    return featureNames[feature] || feature.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getFeatureDescription = (feature: string): string => {
    if (description) return description;
    
    const descriptions: Record<string, string> = {
      'dashboard-customization': 'Create custom dashboards with AI-powered layouts and advanced templates',
      'ai-assistant': 'Access advanced AI-powered insights and recommendations',
      'playground': 'Experiment with AI models and custom prompts',
      'advanced-analytics': 'Deep dive into advanced analytics and predictive modeling',
      'custom-models': 'Train and deploy custom machine learning models',
      'unlimited-users': 'Add unlimited team members to your workspace',
      'priority-support': 'Get priority support and dedicated assistance'
    };
    
    return descriptions[feature] || `Access to ${getFeatureDisplayName(feature)} requires an Enterprise license`;
  };

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "flex items-center space-x-3 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-700",
          className
        )}
      >
        <div className="flex-shrink-0">
          <Crown className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
            Enterprise Feature
          </p>
          <p className="text-xs text-purple-700 dark:text-purple-300">
            Upgrade to unlock {getFeatureDisplayName(feature)}
          </p>
        </div>
        <button className="flex-shrink-0 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-md transition-colors">
          Upgrade
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-hidden bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-purple-900/20 dark:via-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-purple-200 dark:border-purple-700",
        className
      )}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      
      {/* Floating Icons */}
      <div className="absolute top-4 right-4 opacity-20">
        <Sparkles className="h-8 w-8 text-purple-500 animate-pulse" />
      </div>
      <div className="absolute bottom-4 left-4 opacity-20">
        <Zap className="h-6 w-6 text-blue-500 animate-bounce" style={{ animationDelay: '1s' }} />
      </div>
      
      <div className="relative p-8 text-center">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 150 }}
          className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl mb-6 shadow-lg"
        >
          <Crown className="h-8 w-8 text-white" />
        </motion.div>
        
        {/* Title */}
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3"
        >
          Unlock Enterprise Features
        </motion.h3>
        
        {/* Feature Name */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 rounded-full mb-4"
        >
          <Lock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          <span className="text-sm font-medium text-purple-800 dark:text-purple-200">
            {getFeatureDisplayName(feature)}
          </span>
        </motion.div>
        
        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto leading-relaxed"
        >
          {getFeatureDescription(feature)}
        </motion.p>
        
        {/* Features List */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8 max-w-lg mx-auto"
        >
          {[
            'Custom Dashboards',
            'AI-Powered Insights',
            'Advanced Templates',
            'Auto-Generated Layouts',
            'Unlimited Customization',
            'Priority Support'
          ].map((item) => (
            <div key={item} className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
              <div className="w-2 h-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full" />
              <span>{item}</span>
            </div>
          ))}
        </motion.div>
        
        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <button className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
            Upgrade to Enterprise
          </button>
          <button className="px-6 py-3 border border-purple-300 dark:border-purple-600 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 font-medium rounded-lg transition-colors">
            Learn More
          </button>
        </motion.div>
        
        {/* Enterprise Badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 inline-flex items-center space-x-2 text-xs text-purple-600 dark:text-purple-400"
        >
          <Crown className="h-3 w-3" />
          <span>Enterprise License Required</span>
        </motion.div>
      </div>
    </motion.div>
  );
};