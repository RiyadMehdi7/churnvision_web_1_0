import { AnimatePresence, motion, Transition } from 'framer-motion';
import { memo } from 'react';

interface AppLaunchAnimationProps {
  isVisible: boolean;
  versionLabel?: string;
}

const containerTransition: Transition = {
  duration: 0.4,
  ease: [0.16, 1, 0.3, 1] as const,
};

export const AppLaunchAnimation = memo(({ isVisible, versionLabel }: AppLaunchAnimationProps) => (
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
        <div className="app-launch-backdrop" aria-hidden="true" />

        <motion.div
          className="app-launch-card"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.98 }}
          transition={{
            duration: 0.55,
            ease: [0.34, 1.56, 0.64, 1] as const,
          }}
        >
          <motion.div
            className="app-launch-logo"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.35 }}
          >
            ChurnVision
          </motion.div>

          <p className="app-launch-subtitle">Initializing workspace</p>

          {versionLabel && (
            <motion.span
              className="app-launch-version"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
            >
              {versionLabel}
            </motion.span>
          )}

          <div className="app-launch-orb" aria-hidden="true" />

          <div className="app-launch-progress" aria-hidden="true">
            <div className="app-launch-progress-glow" />
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
));

AppLaunchAnimation.displayName = 'AppLaunchAnimation';
