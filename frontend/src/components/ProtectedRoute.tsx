import React from 'react';
import { useLicense, getLicenseTierDisplayName } from '../providers/LicenseProvider';
import { Lock, ArrowRight, Star, Zap, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProtectedRouteProps {
  children: React.ReactNode;
  feature: string;
}

const getFeatureInfo = (feature: string) => {
  switch (feature) {
    case 'ai-assistant':
      return {
        name: 'AI Assistant',
        description: 'Get intelligent insights and recommendations with our AI-powered assistant.',
        requiredTier: 'Advanced',
        icon: Zap,
        benefits: [
          'AI-powered employee analysis',
          'Intelligent retention recommendations',
          'Natural language queries',
          'Predictive insights'
        ]
      };
    case 'playground':
      return {
        name: 'Playground',
        description: 'Advanced simulation and modeling tools for comprehensive workforce analysis.',
        requiredTier: 'Enterprise',
        icon: Building2,
        benefits: [
          'Advanced simulation modeling',
          'What-if scenario analysis',
          'Treatment effectiveness testing',
          'ROI calculations',
          'Custom intervention strategies'
        ]
      };
    default:
      return {
        name: 'Feature',
        description: 'This feature requires a higher license tier.',
        requiredTier: 'Advanced',
        icon: Star,
        benefits: ['Enhanced functionality']
      };
  }
};

export function ProtectedRoute({ children, feature }: ProtectedRouteProps) {
  const { hasAccess, licenseTier } = useLicense();

  if (hasAccess(feature)) {
    return <>{children}</>;
  }

  const featureInfo = getFeatureInfo(feature);
  const FeatureIcon = featureInfo.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl w-full"
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-6 text-white">
            <div className="flex items-center justify-center mb-4">
              <div className="p-3 bg-white/20 rounded-full">
                <Lock className="h-8 w-8" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-center mb-2">
              {featureInfo.name} Access Required
            </h1>
            <p className="text-blue-100 text-center">
              Upgrade to {featureInfo.requiredTier} to unlock this feature
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                <FeatureIcon className="h-8 w-8 text-gray-600 dark:text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {featureInfo.name}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {featureInfo.description}
              </p>
            </div>

            {/* Current vs Required */}
            <div className="flex items-center justify-center space-x-4 mb-8">
              <div className="text-center">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Current Plan</div>
                <div className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm font-medium">
                  {getLicenseTierDisplayName(licenseTier)}
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400" />
              <div className="text-center">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Required Plan</div>
                <div className="px-3 py-1 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full text-sm font-medium">
                  {featureInfo.requiredTier}
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">
                What you'll get with {featureInfo.requiredTier}:
              </h3>
              <ul className="space-y-3">
                {featureInfo.benefits.map((benefit, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    className="flex items-center space-x-3"
                  >
                    <div className="flex-shrink-0 w-5 h-5 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    </div>
                    <span className="text-gray-700 dark:text-gray-300">{benefit}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => window.history.back()}
                className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  // TODO: Implement upgrade flow
                  console.log('Upgrade to', featureInfo.requiredTier);
                }}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all transform hover:scale-105 font-medium"
              >
                Upgrade to {featureInfo.requiredTier}
              </button>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          Need help choosing the right plan? Contact our sales team for personalized recommendations.
        </p>
      </motion.div>
    </div>
  );
} 