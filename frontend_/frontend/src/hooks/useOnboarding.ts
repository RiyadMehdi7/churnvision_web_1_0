import { useState, useEffect } from 'react';

const ONBOARDING_COMPLETED_KEY = 'churnvision-onboarding-completed';
const ONBOARDING_RESET_EVENT = 'cv:onboarding-reset';
const ONBOARDING_COMPLETE_EVENT = 'cv:onboarding-complete';

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check global onboarding status from localStorage
    const completedOnboarding = localStorage.getItem(ONBOARDING_COMPLETED_KEY);
    
    // Show onboarding if it hasn't been completed globally
    setShowOnboarding(!completedOnboarding);
    setIsLoading(false);
    
    // Listen for onboarding events to sync across components
    const handleReset = () => setShowOnboarding(true);
    const handleComplete = () => setShowOnboarding(false);
    window.addEventListener(ONBOARDING_RESET_EVENT, handleReset as EventListener);
    window.addEventListener(ONBOARDING_COMPLETE_EVENT, handleComplete as EventListener);

    // Also listen to storage changes (cross-tab safety; same-tab won't fire but harmless)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === ONBOARDING_COMPLETED_KEY) {
        const isCompleted = localStorage.getItem(ONBOARDING_COMPLETED_KEY);
        setShowOnboarding(!isCompleted);
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(ONBOARDING_RESET_EVENT, handleReset as EventListener);
      window.removeEventListener(ONBOARDING_COMPLETE_EVENT, handleComplete as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []); // No dependencies needed now

  const completeOnboarding = () => {
    // Set global key
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    setShowOnboarding(false);
    // Notify other hook instances
    window.dispatchEvent(new Event(ONBOARDING_COMPLETE_EVENT));
  };

  const resetOnboarding = () => {
    // Remove global key
    localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
    setShowOnboarding(true);
    // Notify other hook instances (e.g., App) to show tutorial immediately
    window.dispatchEvent(new Event(ONBOARDING_RESET_EVENT));
  };

  return {
    showOnboarding,
    isLoading,
    completeOnboarding,
    resetOnboarding
  };
} 