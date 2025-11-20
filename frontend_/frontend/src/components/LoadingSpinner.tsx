// Removed motion import to reduce memory usage
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'spinner' | 'dots' | 'pulse' | 'bars';
  text?: string;
  className?: string;
  color?: 'primary' | 'secondary' | 'white' | 'gray';
}

const sizeClasses = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4', 
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8'
};

const colorClasses = {
  primary: 'text-app-green',
  secondary: 'text-blue-500',
  white: 'text-white',
  gray: 'text-gray-400'
};

const SpinnerVariant = ({ size, color, className }: { size: string; color: string; className?: string }) => (
  <Loader2 className={`${size} ${color} animate-spin ${className || ''}`} />
);

const DotsVariant = ({ size, color }: { size: string; color: string }) => {
  const dotSize = size.includes('w-3') ? 'w-1 h-1' : size.includes('w-4') ? 'w-1.5 h-1.5' : 'w-2 h-2';
  
  return (
    <div className="flex space-x-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`${dotSize} ${color.replace('text-', 'bg-')} rounded-full animate-pulse`}
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
};

const PulseVariant = ({ size, color }: { size: string; color: string }) => (
  <div className={`${size} ${color.replace('text-', 'bg-')} rounded-full animate-pulse`} />
);

const BarsVariant = ({ size, color }: { size: string; color: string }) => {
  const barHeight = size.includes('w-3') ? 'h-3' : size.includes('w-4') ? 'h-4' : 'h-5';
  
  return (
    <div className="flex space-x-1 items-end">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-1 ${barHeight} ${color.replace('text-', 'bg-')} rounded-sm animate-pulse`}
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
};

export function LoadingSpinner({ 
  size = 'md', 
  variant = 'spinner', 
  text, 
  className = '',
  color = 'primary'
}: LoadingSpinnerProps) {
  const sizeClass = sizeClasses[size];
  const colorClass = colorClasses[color];

  const renderVariant = () => {
    switch (variant) {
      case 'dots':
        return <DotsVariant size={sizeClass} color={colorClass} />;
      case 'pulse':
        return <PulseVariant size={sizeClass} color={colorClass} />;
      case 'bars':
        return <BarsVariant size={sizeClass} color={colorClass} />;
      default:
        return <SpinnerVariant size={sizeClass} color={colorClass} className={className} />;
    }
  };

  if (text) {
    return (
      <div className="flex items-center gap-2">
        {renderVariant()}
        <span className={`text-sm ${colorClass}`}>{text}</span>
      </div>
    );
  }

  return renderVariant();
}

// Preset loading states for common use cases
export const LoadingStates = {
  // For buttons
  ButtonLoading: ({ text = 'Loading...' }: { text?: string }) => (
    <LoadingSpinner size="sm" text={text} color="white" />
  ),
  
  // For page loading
  PageLoading: ({ text = 'Loading...' }: { text?: string }) => (
    <div className="flex flex-col items-center justify-center min-h-[200px] space-y-3">
      <LoadingSpinner size="lg" variant="spinner" color="primary" />
      <p className="text-gray-600 dark:text-gray-400">{text}</p>
    </div>
  ),
  
  // For inline content
  InlineLoading: ({ text }: { text?: string }) => (
    <LoadingSpinner size="sm" text={text} color="gray" />
  ),
  
  // For cards/components
  CardLoading: ({ text = 'Loading...' }: { text?: string }) => (
    <div className="flex items-center justify-center p-8">
      <LoadingSpinner size="md" text={text} color="primary" />
    </div>
  ),
  
  // For data tables
  TableLoading: () => (
    <div className="flex items-center justify-center py-8">
      <LoadingSpinner size="md" variant="dots" color="primary" />
    </div>
  ),
  
  // For overlays
  OverlayLoading: ({ text = 'Processing...' }: { text?: string }) => (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl">
        <div className="flex flex-col items-center space-y-3">
          <LoadingSpinner size="lg" color="primary" />
          <p className="text-gray-700 dark:text-gray-300 font-medium">{text}</p>
        </div>
      </div>
    </div>
  )
}; 