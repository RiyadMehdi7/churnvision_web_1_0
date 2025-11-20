import React, { useState, memo, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { SmartNotificationSystem, useSmartNotifications } from '../components/SmartNotificationSystem';
import { SmartHeader } from '../components/SmartHeader';
import { Button } from '../components/ui/button';
import { CheckCircle } from 'lucide-react';

const TierShowcase = memo(({ tier, features, onSelect, isSelected }: {
  tier: string;
  features: string[];
  onSelect: () => void;
  isSelected: boolean;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`p-6 rounded-lg border-2 ${isSelected ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700'}`}
    >
      <h3 className="text-2xl font-bold mb-4">{tier}</h3>
      <ul className="space-y-2 mb-6">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Button onClick={onSelect} className="w-full" disabled={isSelected}>
        {isSelected ? 'Selected' : 'Select Plan'}
      </Button>
    </motion.div>
  );
});

export const WowDemo: React.FC = () => {
  const { notifications, addNotification, dismissNotification } = useSmartNotifications();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState('enterprise');

  const tiers = useMemo(() => ({
    free: {
      name: 'Free',
      features: [
        'Churn Prediction (up to 50 employees)',
        'Basic Behavioral Analysis',
        'Data Import (CSV)',
      ],
    },
    pro: {
      name: 'Pro',
      features: [
        'Churn Prediction (up to 500 employees)',
        'Advanced Behavioral Analysis',
        'AI Reasoning for Churn',
        'Data Import (CSV, SQL)',
        'Advanced Analytics Dashboard',
      ],
    },
    enterprise: {
      name: 'Enterprise',
      features: [
        'Unlimited Churn Prediction',
        'Advanced Behavioral Analysis',
        'AI Reasoning for Churn',
        'Data Import (CSV, SQL, API)',
        'Advanced Analytics Dashboard',
        'Custom Model Integration',
        'Unlimited Users',
        'Priority Support',
      ],
    },
  }), []);

  const handleTierSelect = useCallback((tier: string) => {
    setSelectedTier(tier);
    const tierInfo = tiers[tier as keyof typeof tiers];
    addNotification({
      type: 'success',
      title: `Switched to ${tierInfo.name} Plan`,
      message: `You are now viewing the features available in the ${tierInfo.name} plan.`,
      duration: 4000,
    });
  }, [addNotification, tiers]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-900">
      <SmartHeader 
        onMenuToggle={() => setIsMenuOpen(!isMenuOpen)}
        isMenuOpen={isMenuOpen}
      />

      <div className="container mx-auto px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Welcome to ChurnVision
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Select a plan to see the powerful features available to you.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {Object.entries(tiers).map(([key, tier]) => (
            <TierShowcase
              key={key}
              tier={tier.name}
              features={tier.features}
              onSelect={() => handleTierSelect(key)}
              isSelected={selectedTier === key}
            />
          ))}
        </div>

        <div className="text-center">
          <Button size="lg" onClick={() => {}}>
            Get Started with the {tiers[selectedTier as keyof typeof tiers].name} Plan
          </Button>
        </div>
      </div>

      <SmartNotificationSystem
        notifications={notifications}
        onDismiss={dismissNotification}
        position="top-right"
      />
    </div>
  );
};
