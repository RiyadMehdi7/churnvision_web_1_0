import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { getCurrentThresholds, getRiskLevel, isCalibrating, subscribeToCalibrationChanges } from '../../config/riskThresholds';
import React from 'react';

interface RiskIndicatorProps {
  riskScore: number | undefined | null;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showPercent?: boolean;
}

// Risk thresholds are now managed dynamically

const sizeMap = {
  sm: {
    icon: 'w-3.5 h-3.5',
    text: 'text-xs',
    pad: 'px-1.5 py-0.5',
    percent: false,
  },
  md: {
    icon: 'w-4 h-4',
    text: 'text-sm',
    pad: 'px-2 py-0.5',
    percent: true,
  },
  lg: {
    icon: 'w-5 h-5',
    text: 'text-base',
    pad: 'px-3 py-1',
    percent: true,
  },
};

export function RiskIndicator({
  riskScore,
  size = 'md',
  showIcon = false,
  showPercent,
}: RiskIndicatorProps) {
  const score = typeof riskScore === 'number' ? Math.min(Math.max(riskScore, 0), 1) : 0;
  const thresholds = getCurrentThresholds();
  const [calibrating, setCalibrating] = React.useState<boolean>(isCalibrating());

  React.useEffect(() => {
    const unsubscribe = subscribeToCalibrationChanges((state) => setCalibrating(state));
    return () => unsubscribe();
  }, []);

  // Use dynamic risk thresholds
  const level = calibrating ? null : getRiskLevel(score, thresholds);
  
  let bg = 'bg-green-100 dark:bg-green-900/60';
  let border = 'border-green-200 dark:border-green-800';
  let text = 'text-green-800 dark:text-green-200';
  let iconColor = 'text-green-500 dark:text-green-300';
  let IconComponent: React.ElementType = CheckCircle;

  if (level === 'High') {
    bg = 'bg-red-100 dark:bg-red-900/60';
    border = 'border-red-200 dark:border-red-800';
    text = 'text-red-800 dark:text-red-200';
    iconColor = 'text-red-500 dark:text-red-300';
    IconComponent = AlertTriangle;
  } else if (level === 'Medium') {
    bg = 'bg-yellow-100 dark:bg-yellow-900/60';
    border = 'border-yellow-200 dark:border-yellow-800';
    text = 'text-yellow-800 dark:text-yellow-200';
    iconColor = 'text-yellow-500 dark:text-yellow-300';
    IconComponent = AlertCircle;
  } else if (level === null) {
    bg = 'bg-gray-100 dark:bg-gray-800/60';
    border = 'border-gray-200 dark:border-gray-700';
    text = 'text-gray-600 dark:text-gray-300';
    iconColor = 'text-gray-400 dark:text-gray-400';
    IconComponent = AlertCircle;
  }

  const { icon, text: textSize, pad, percent } = sizeMap[size];
  const showPct = showPercent !== undefined ? showPercent : percent;

  return (
    <span
      className={cn(
        'inline-flex items-center min-w-0 gap-1 rounded-full border font-normal',
        bg,
        border,
        text,
        textSize,
        pad,
        'transition-colors duration-200'
      )}
      title={calibrating ? 'Calibrating risk thresholds...' : `Risk Level: ${level} (${Math.round(score * 100)}%)`}
    >
      {showIcon && <IconComponent className={cn(icon, iconColor, 'shrink-0')} />}
      <span className="truncate">{calibrating ? 'Calibrating...' : `${level} Risk`}</span>
      {!calibrating && showPct && (
        <span className="opacity-70 font-normal ml-0.5 truncate">({Math.round(score * 100)}%)</span>
      )}
    </span>
  );
} 