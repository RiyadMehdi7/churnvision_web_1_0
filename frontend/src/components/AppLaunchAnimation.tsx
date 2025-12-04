import { AnimatePresence, motion, Transition } from 'framer-motion';
import { memo, useEffect, useState } from 'react';
import { Database, Brain, Sparkles, Shield, CheckCircle2 } from 'lucide-react';

interface AppLaunchAnimationProps {
  isVisible: boolean;
  versionLabel?: string;
}

const containerTransition: Transition = {
  duration: 0.5,
  ease: [0.16, 1, 0.3, 1] as const,
};

const loadingSteps = [
  { icon: Database, label: 'Loading data models', delay: 0 },
  { icon: Brain, label: 'Initializing AI engine', delay: 600 },
  { icon: Shield, label: 'Verifying license', delay: 1200 },
  { icon: Sparkles, label: 'Preparing workspace', delay: 1800 },
];

export const AppLaunchAnimation = memo(({ isVisible, versionLabel }: AppLaunchAnimationProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  useEffect(() => {
    if (!isVisible) {
      setCurrentStep(0);
      setCompletedSteps([]);
      return;
    }

    const timers: NodeJS.Timeout[] = [];

    loadingSteps.forEach((step, index) => {
      const timer = setTimeout(() => {
        setCurrentStep(index);
        if (index > 0) {
          setCompletedSteps(prev => [...prev, index - 1]);
        }
      }, step.delay);
      timers.push(timer);
    });

    // Complete last step
    const finalTimer = setTimeout(() => {
      setCompletedSteps(prev => [...prev, loadingSteps.length - 1]);
    }, 2400);
    timers.push(finalTimer);

    return () => timers.forEach(clearTimeout);
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="app-launch-overlay"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={containerTransition}
        >
          {/* Animated background particles */}
          <div className="app-launch-particles" aria-hidden="true">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                className="app-launch-particle"
                initial={{
                  opacity: 0,
                  x: Math.random() * 100 - 50,
                  y: Math.random() * 100 - 50,
                }}
                animate={{
                  opacity: [0, 0.6, 0],
                  y: [0, -100 - Math.random() * 100],
                  x: Math.random() * 40 - 20,
                }}
                transition={{
                  duration: 3 + Math.random() * 2,
                  repeat: Infinity,
                  delay: Math.random() * 2,
                  ease: 'easeOut',
                }}
                style={{
                  left: `${10 + Math.random() * 80}%`,
                  top: `${60 + Math.random() * 30}%`,
                }}
              />
            ))}
          </div>

          <div className="app-launch-backdrop" aria-hidden="true" />

          {/* Ambient glow rings */}
          <div className="app-launch-glow-container" aria-hidden="true">
            <motion.div
              className="app-launch-glow-ring app-launch-glow-ring-1"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="app-launch-glow-ring app-launch-glow-ring-2"
              animate={{
                scale: [1.1, 0.9, 1.1],
                opacity: [0.2, 0.4, 0.2],
              }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            />
          </div>

          <motion.div
            className="app-launch-card"
            initial={{ opacity: 0, y: 30, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.95 }}
            transition={{
              duration: 0.6,
              ease: [0.34, 1.56, 0.64, 1] as const,
            }}
          >
            {/* Animated corner accents */}
            <div className="app-launch-corner app-launch-corner-tl" />
            <div className="app-launch-corner app-launch-corner-br" />

            {/* Logo with gradient */}
            <motion.div
              className="app-launch-logo-container"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              <motion.div
                className="app-launch-logo-icon"
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              >
                <svg viewBox="0 0 40 40" className="w-10 h-10">
                  <defs>
                    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="50%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#6ee7b7" />
                    </linearGradient>
                  </defs>
                  <circle cx="20" cy="20" r="18" fill="none" stroke="url(#logoGrad)" strokeWidth="2" opacity="0.3" />
                  <circle cx="20" cy="20" r="12" fill="none" stroke="url(#logoGrad)" strokeWidth="2" opacity="0.5" />
                  <circle cx="20" cy="20" r="6" fill="url(#logoGrad)" />
                </svg>
              </motion.div>
              <div className="app-launch-logo">
                <span className="app-launch-logo-text">Churn</span>
                <span className="app-launch-logo-text-accent">Vision</span>
              </div>
            </motion.div>

            {versionLabel && (
              <motion.span
                className="app-launch-version"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                <span className="app-launch-version-dot" />
                {versionLabel}
              </motion.span>
            )}

            {/* Loading steps */}
            <motion.div
              className="app-launch-steps"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              {loadingSteps.map((step, index) => {
                const Icon = step.icon;
                const isActive = currentStep === index;
                const isCompleted = completedSteps.includes(index);

                return (
                  <motion.div
                    key={index}
                    className={`app-launch-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.08, duration: 0.3 }}
                  >
                    <div className="app-launch-step-icon">
                      {isCompleted ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                        </motion.div>
                      ) : (
                        <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-400'}`} />
                      )}
                    </div>
                    <span className={`app-launch-step-label ${isActive || isCompleted ? 'active' : ''}`}>
                      {step.label}
                    </span>
                    {isActive && !isCompleted && (
                      <motion.div
                        className="app-launch-step-pulse"
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Progress bar */}
            <motion.div
              className="app-launch-progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.3 }}
            >
              <motion.div
                className="app-launch-progress-fill"
                initial={{ width: '0%' }}
                animate={{ width: `${((completedSteps.length) / loadingSteps.length) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
              <div className="app-launch-progress-shimmer" />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

AppLaunchAnimation.displayName = 'AppLaunchAnimation';
