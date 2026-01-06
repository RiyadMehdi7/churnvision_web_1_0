import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  X, 
  Brain,
  TrendingUp,
  Users
} from 'lucide-react';

interface SmartNotification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info' | 'ai-insight';
  title: string;
  message: string;
  duration?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  actionable?: boolean;
  onAction?: () => void;
  actionLabel?: string;
  data?: any;
}

interface NotificationSystemProps {
  notifications: SmartNotification[];
  onDismiss: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center';
}

const notificationConfig = {
  success: {
    icon: CheckCircle,
    colors: 'from-green-400 to-emerald-500',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
    textColor: 'text-green-800 dark:text-green-200'
  },
  warning: {
    icon: AlertTriangle,
    colors: 'from-yellow-400 to-orange-500',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    textColor: 'text-yellow-800 dark:text-yellow-200'
  },
  error: {
    icon: AlertTriangle,
    colors: 'from-red-400 to-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
    textColor: 'text-red-800 dark:text-red-200'
  },
  info: {
    icon: Info,
    colors: 'from-blue-400 to-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    textColor: 'text-blue-800 dark:text-blue-200'
  },
  'ai-insight': {
    icon: Brain,
    colors: 'from-purple-400 to-pink-500',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-200 dark:border-purple-800',
    textColor: 'text-purple-800 dark:text-purple-200'
  }
};

const NotificationCard: React.FC<{
  notification: SmartNotification;
  onDismiss: (id: string) => void;
  index: number;
}> = ({ notification, onDismiss, index }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(100);
  const config = notificationConfig[notification.type];
  const Icon = config.icon;

  // Auto-dismiss timer
  useEffect(() => {
    if (!notification.duration) return;
    
    const interval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev - (100 / (notification.duration! / 100));
        if (newProgress <= 0) {
          onDismiss(notification.id);
          return 0;
        }
        return newProgress;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [notification.duration, notification.id, onDismiss]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    
    // Dismiss if dragged far enough
    if (Math.abs(info.offset.x) > 200 || Math.abs(info.velocity.x) > 500) {
      onDismiss(notification.id);
    }
  };

  const getPriorityIndicator = () => {
    switch (notification.priority) {
      case 'critical':
        return (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-3 h-3 bg-red-500 rounded-full"
          />
        );
      case 'high':
        return <div className="w-3 h-3 bg-orange-500 rounded-full" />;
      case 'medium':
        return <div className="w-3 h-3 bg-yellow-500 rounded-full" />;
      default:
        return <div className="w-3 h-3 bg-blue-500 rounded-full" />;
    }
  };

  return (
    <motion.div
      layout
      initial={{ 
        opacity: 0, 
        x: 300, 
        scale: 0.9,
        rotateY: -15
      }}
      animate={{ 
        opacity: 1, 
        x: 0, 
        scale: 1,
        rotateY: 0
      }}
      exit={{ 
        opacity: 0, 
        x: 300, 
        scale: 0.8,
        rotateY: 15,
        transition: { duration: 0.2 }
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        delay: index * 0.1
      }}
      drag="x"
      dragConstraints={{ left: -400, right: 400 }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      whileDrag={{ 
        scale: 1.05,
        rotateZ: isDragging ? 5 : 0,
        boxShadow: "0 20px 40px rgba(0,0,0,0.15)"
      }}
      className={`
        ${config.bgColor} ${config.borderColor} ${config.textColor}
        relative overflow-hidden rounded-2xl border shadow-lg backdrop-blur-sm
        cursor-grab active:cursor-grabbing max-w-sm w-full mb-4
        transform-gpu
      `}
      style={{
        transformStyle: 'preserve-3d'
      }}
    >
      {/* Priority indicator */}
      <div className="absolute top-3 left-3">
        {getPriorityIndicator()}
      </div>

      {/* Progress bar for timed notifications */}
      {notification.duration && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-black/10">
          <motion.div
            className={`h-full bg-gradient-to-r ${config.colors}`}
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      )}

      <div className="p-6 pt-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <motion.div
              animate={{ 
                rotate: notification.type === 'ai-insight' ? [0, 360] : 0,
                scale: notification.priority === 'critical' ? [1, 1.1, 1] : 1
              }}
              transition={{ 
                rotate: { duration: 2, repeat: Infinity, ease: "linear" },
                scale: { duration: 1, repeat: Infinity }
              }}
              className={`w-8 h-8 rounded-full bg-gradient-to-br ${config.colors} flex items-center justify-center text-white shadow-lg`}
            >
              <Icon size={16} />
            </motion.div>
            <h3 className="font-semibold text-sm">{notification.title}</h3>
          </div>
          
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onDismiss(notification.id)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </motion.button>
        </div>

        {/* Message */}
        <p className="text-sm mb-4 leading-relaxed">
          {notification.message}
        </p>

        {/* Action button */}
        {notification.actionable && notification.onAction && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={notification.onAction}
            className={`
              w-full py-2 px-4 rounded-lg font-medium text-sm
              bg-gradient-to-r ${config.colors} text-white
              shadow-md hover:shadow-lg transition-shadow
            `}
          >
            {notification.actionLabel || 'Take Action'}
          </motion.button>
        )}

        {/* AI Insight specific content */}
        {notification.type === 'ai-insight' && notification.data && (
          <div className="mt-4 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center space-x-1">
                <TrendingUp size={12} />
                <span>Risk Level: {notification.data.riskLevel}</span>
              </span>
              <span className="flex items-center space-x-1">
                <Users size={12} />
                <span>{notification.data.affectedCount} employees</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Drag indicator */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none"
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const SmartNotificationSystem: React.FC<NotificationSystemProps> = ({
  notifications,
  onDismiss,
  position = 'top-right'
}) => {
  const getPositionClasses = () => {
    switch (position) {
      case 'top-right':
        return 'top-4 right-4';
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'top-center':
        return 'top-4 left-1/2 transform -translate-x-1/2';
      default:
        return 'top-4 right-4';
    }
  };

  return (
    <div className={`fixed ${getPositionClasses()} z-50 max-h-screen overflow-y-auto`}>
      <AnimatePresence mode="popLayout">
        {notifications.map((notification, index) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            onDismiss={onDismiss}
            index={index}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

// Hook for managing notifications
export const useSmartNotifications = () => {
  const [notifications, setNotifications] = useState<SmartNotification[]>([]);

  const addNotification = (notification: Omit<SmartNotification, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { ...notification, id }]);
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  // AI-powered smart notifications
  const addAIInsight = (insight: {
    title: string;
    message: string;
    riskLevel: string;
    affectedCount: number;
    onAction?: () => void;
  }) => {
    addNotification({
      type: 'ai-insight',
      title: insight.title,
      message: insight.message,
      priority: insight.riskLevel === 'High' ? 'critical' : 'medium',
      actionable: !!insight.onAction,
      onAction: insight.onAction,
      actionLabel: 'View Details',
      data: {
        riskLevel: insight.riskLevel,
        affectedCount: insight.affectedCount
      },
      duration: 8000
    });
  };

  return {
    notifications,
    addNotification,
    dismissNotification,
    clearAll,
    addAIInsight
  };
};