import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  userName?: string;
  badges?: Array<{
    label: string;
    variant: 'emerald' | 'purple' | 'blue' | 'sky' | 'amber';
    pulse?: boolean;
  }>;
  rightContent?: React.ReactNode;
}

// Helper function to get greeting based on time of day
const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const badgeVariants = {
  emerald: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-400',
    glow: 'bg-emerald-500/20',
  },
  purple: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    dot: 'bg-purple-400',
    glow: 'bg-purple-500/20',
  },
  blue: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
    dot: 'bg-blue-400',
    glow: 'bg-blue-500/20',
  },
  sky: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
    dot: 'bg-sky-400',
    glow: 'bg-sky-500/20',
  },
  amber: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
    glow: 'bg-amber-500/20',
  },
};

export const PageHeader = memo(({
  title,
  subtitle,
  icon: Icon,
  userName,
  badges = [],
  rightContent,
}: PageHeaderProps) => {
  return (
    <header className="flex-shrink-0 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gray-700/50 relative overflow-hidden">
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-500/50 to-transparent" />
      </div>

      <div className="relative px-6 py-4 min-h-[72px]">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title section */}
          <div className="flex items-center gap-4 min-w-0">
            {/* Icon */}
            {Icon && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm"
              >
                <Icon className="w-5 h-5 text-white" />
              </motion.div>
            )}

            {/* Title & Subtitle */}
            <div className="min-w-0">
              {/* Greeting - only on pages where userName is provided */}
              {userName && (
                <motion.p
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-sm text-gray-400 mb-0.5"
                >
                  {getGreeting()},{' '}
                  <span className="text-emerald-400 font-medium">{userName}</span>
                </motion.p>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <motion.h1
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xl sm:text-2xl font-bold text-white truncate"
                >
                  {title}
                </motion.h1>

                {/* Badges */}
                {badges.length > 0 && (
                  <div className="flex items-center gap-2">
                    {badges.map((badge, idx) => {
                      const variant = badgeVariants[badge.variant];
                      return (
                        <motion.span
                          key={badge.label}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.1 + idx * 0.05 }}
                          className="relative"
                        >
                          <span
                            className={`px-2 py-0.5 text-xs font-medium ${variant.bg} ${variant.text} rounded-full border ${variant.border} relative z-10 flex items-center gap-1.5`}
                          >
                            {badge.pulse && (
                              <>
                                <span className={`h-1.5 w-1.5 rounded-full ${variant.dot} animate-ping absolute`} />
                                <span className={`h-1.5 w-1.5 rounded-full ${variant.dot}`} />
                              </>
                            )}
                            {!badge.pulse && (
                              <span className={`h-1.5 w-1.5 rounded-full ${variant.dot}`} />
                            )}
                            {badge.label}
                          </span>
                          <div className={`absolute inset-0 ${variant.glow} rounded-full blur-sm opacity-60`} />
                        </motion.span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Subtitle */}
              {subtitle && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-sm text-gray-400 mt-1 hidden sm:block"
                >
                  {subtitle}
                </motion.p>
              )}
            </div>
          </div>

          {/* Right: Custom content */}
          {rightContent && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-shrink-0"
            >
              {rightContent}
            </motion.div>
          )}
        </div>
      </div>
    </header>
  );
});

PageHeader.displayName = 'PageHeader';

export default PageHeader;
