import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '../../providers/ThemeProvider';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = '' }: ThemeToggleProps): React.ReactElement {
  const { theme, toggleTheme } = useTheme();

  const appearanceClasses =
    theme === 'dark'
      ? 'bg-surface-muted hover:bg-surface-elevated text-primary-foreground'
      : 'bg-surface-subtle hover:bg-surface-muted text-primary';

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggleTheme}
      className={`relative p-2 rounded-md border border-border transition-all duration-300 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${appearanceClasses} ${className}`}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.div
        className="absolute inset-0 z-0"
        initial={false}
        animate={{
          backgroundColor: theme === 'dark'
            ? 'hsl(var(--surface-muted) / 0.85)'
            : 'hsl(var(--surface-subtle) / 0.85)',
        }}
        transition={{ duration: 0.3 }}
      />
      
      <motion.div
        className="relative z-10"
        initial={false}
        animate={{ 
          rotate: theme === 'dark' ? 0 : 180,
          scale: [1, 1.2, 1],
        }}
        transition={{ 
          rotate: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
          scale: { duration: 0.5, times: [0, 0.5, 1] }
        }}
      >
        <AnimatedIcon theme={theme} />
      </motion.div>
      
      {/* Subtle glow effect */}
      <motion.div 
        className="absolute inset-0 rounded-md z-0"
        initial={false}
        animate={{ 
          boxShadow: theme === 'dark' 
            ? '0 0 12px 2px hsl(var(--primary) / 0.3)' 
            : '0 0 12px 2px hsl(var(--primary) / 0.18)' 
        }}
        transition={{ duration: 0.3 }}
      />
    </motion.button>
  );
}

function AnimatedIcon({ theme }: { theme: 'light' | 'dark' }): React.ReactElement {
  return (
    <div className="relative h-5 w-5 flex items-center justify-center">
      {theme === 'dark' ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <Sun className="h-5 w-5" />
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
        >
          <Moon className="h-5 w-5" />
        </motion.div>
      )}
    </div>
  );
} 
